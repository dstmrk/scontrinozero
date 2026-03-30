# REVIEW — Analisi codice (multi-pass)

## Metodo usato

- Ho eseguito una prima passata completa sui flussi core: autenticazione, API v1, emissione/annullo AdE, Stripe billing, export dati, middleware e librerie security (`crypto`, `logger`, `get-client-ip`).
- Prima di registrare ogni finding, ho verificato che **non fosse già pianificato in `PLAN.md`** (esclusi quindi: dedup webhook Stripe, paginazione storico/export, key rotation zero-downtime, error envelope uniforme, TTL/revoca link pubblici, limiti mensili Developer API).
- Ho fatto una seconda passata focalizzata su edge-case di stato e failure-mode (idempotenza, race conditions, leak di segreti in log, consistenza billing).
- Ho fatto una terza passata di verifica incrociata: **nessuna nuova issue** rispetto alla seconda passata.

---

## Findings ordinati per priorità

## P1-01 — Retry annullo bloccato dopo primo tentativo fallito (vincolo unico troppo rigido)

**Categoria:** Funzionalità / Affidabilità

### Evidenza

- `voidReceiptForBusiness` inserisce sempre un nuovo documento `VOID` con `voidedDocumentId` e `onConflictDoNothing()`.
- Il DB impone indice unique su `voided_document_id` (`WHERE NOT NULL`).
- Se il primo annullo finisce in `REJECTED` o `ERROR`, tentativi successivi con nuova idempotency key non possono più inserire un nuovo `VOID`.

### Impatto

- Un annullo può restare **irrecuperabile** lato applicazione anche se il fallimento era transitorio (errore rete/AdE temporaneo).
- Operativamente l’esercente non riesce più ad annullare uno scontrino valido senza intervento manuale DB.

### Fix richiesto (non ambiguo)

1. Cambiare il modello da “1 record VOID per sempre” a “1 tentativo attivo/riuscito per SALE”.
2. Opzione consigliata:
   - mantenere unique su `voided_document_id` **solo per stati attivi/riusciti** (`PENDING`, `VOID_ACCEPTED`) tramite indice parziale;
   - consentire nuovi tentativi quando l’ultimo è `ERROR` o `REJECTED`.
3. In alternativa (se non si vuole cambiare indice): riutilizzare il record `VOID` esistente in errore facendo retry idempotente “in-place” con lock + CAS sullo stato.
4. Aggiornare il messaggio di errore API distinguendo:
   - già annullato (`VOID_ACCEPTED`),
   - annullo in corso (`PENDING`),
   - annullo fallito ma ritentabile.

### Test da aggiungere

- `it("consente retry annullo dopo VOID REJECTED")`
- `it("consente retry annullo dopo VOID ERROR")`
- `it("continua a bloccare doppio annullo concorrente quando uno è PENDING")`

---

## P1-02 — Token di reset password potenzialmente loggato in chiaro

**Categoria:** Sicurezza

### Evidenza

- Nel controllo difensivo del reset password viene loggato `actionLink` su mismatch hostname.
- `actionLink` contiene token one-time sensibile.
- Il logger redige molti campi sensibili ma non `actionLink`/`resetLink`.

### Impatto

- In caso di mismatch o anomalia, token di recovery può finire in log applicativi / Sentry.
- Chi ha accesso ai log può tentare takeover account entro finestra di validità link.

### Fix richiesto (non ambiguo)

1. **Non loggare mai URL completi** di recovery.
2. Sostituire log con metadati non sensibili (es. `hostname`, `protocol`, `hasToken=true`).
3. Estendere `REDACT_PATHS` con pattern difensivi (`actionLink`, `resetLink`, `*.actionLink`, `*.resetLink`, eventuale `token`, `code`, `otp`).
4. Verificare che anche eccezioni serializzate non includano query string con token.

### Test da aggiungere

- test unitario logger/redaction che verifica masking su `actionLink` e `resetLink`.
- test su `resetPassword` che in caso di mismatch non emette log con URL completo.

---

## P1-03 — Stato idempotenza “incagliato” su receipt emission dopo errore transitorio

**Categoria:** Funzionalità / Affidabilità

### Evidenza

- In emissione: se esiste già `idempotencyKey` ma stato non `ACCEPTED`, il servizio ritorna errore “stato inconsistente”.
- In caso di failure tra inserimento PENDING e completamento (es. crash/app restart/timeout downstream), la stessa idempotency key non può riprendere il flusso in modo safe.

### Impatto

- Client API ben progettati (che ritentano con stessa idempotency key) non hanno una vera semantica “retry-safe” nei failure mode peggiori.
- Aumenta rischio di workaround lato client (nuova key) e possibili duplicazioni funzionali.

### Fix richiesto (non ambiguo)

1. Definire macchina a stati idempotente esplicita:
   - `PENDING` vecchio oltre soglia => “recoverable retry”,
   - `ERROR`/`REJECTED` => retry controllato o risposta deterministica.
2. Implementare lock applicativo o DB (`SELECT ... FOR UPDATE`) sul record idempotente prima di decidere.
3. Distinguere errori permanenti AdE vs transitori rete.
4. Restituire payload machine-readable (`code`) per guidare retry client.

### Test da aggiungere

- retry con stessa idempotency key dopo crash simulato in fase intermedia.
- retry con record `PENDING` stale.
- garanzia di assenza duplicati in concorrenza.

---

## P2-01 — Webhook Stripe: update silenzioso no-op se subscription row assente

**Categoria:** Funzionalità / Osservabilità

### Evidenza

- `syncSubscriptionData` aggiorna per `stripeCustomerId`; se nessuna riga combacia, non viene fatto upsert né errore esplicito.
- Anche il successivo update piano profilo dipende da quella riga.

### Impatto

- Evento Stripe valido può essere “processato” ma senza effetti: utente paga, piano non aggiornato.
- Problema difficile da diagnosticare perché non viene tracciato come anomalia hard.

### Fix richiesto (non ambiguo)

1. Rendere `syncSubscriptionData` fail-fast se `UPDATE` tocca 0 righe (log `error` strutturato + metrica).
2. Valutare `upsert` della riga subscription quando mancante (se dati minimi presenti).
3. Aggiungere dead-letter/retry strategy applicativa per eventi non riconciliati.
4. Esportare metrica/alert su “webhook processed with no DB match”.

### Test da aggiungere

- webhook `checkout.session.completed` con `stripeCustomerId` non presente => errore osservabile e non silent success.
- percorso di recupero (upsert o retry queue).

---

## P2-02 — Misconfig Cloudflare degrada rate-limit a bucket globale `unknown`

**Categoria:** Sicurezza / Affidabilità operativa

### Evidenza

- In produzione, se `CF-Connecting-IP` manca, `getClientIp` ritorna sempre `"unknown"`.
- Più route sensibili (auth, PDF pubblici, checkout) usano rate-limit su IP.

### Impatto

- In caso di misconfig, un singolo attore può saturare bucket condiviso e causare denial-of-service per utenti legittimi.

### Fix richiesto (non ambiguo)

1. Introdurre fail-safe operativo:
   - opzionale: bloccare richieste sensibili con 503 quando header trusted manca in production;
   - oppure usare fallback secondario trusted configurabile esplicitamente (non automatico).
2. Aggiungere health check/startup check che valida presenza catena proxy attesa.
3. Aggiungere metrica + alert su percentuale richieste con IP `unknown` > soglia.

### Test da aggiungere

- test integrazione: `NODE_ENV=production` + header mancante => comportamento fail-safe definito.

---

## P3-01 — Mancano limiti applicativi su numero API key per business

**Categoria:** Performance / Governance

### Evidenza

- `createApiKey` consente creazione illimitata di chiavi per business senza quota o guardrail.

### Impatto

- Crescita incontrollata tabella, UX degradata, rischio operativo (surface area revoche/rotazioni).

### Fix richiesto (non ambiguo)

1. Definire limite hard per piano (es. Starter 3, Pro 20, Developer 100).
2. Enforcement transazionale al momento di create.
3. Messaggio errore esplicito + endpoint/UI per contare chiavi attive.

### Test da aggiungere

- supera limite => create fallisce con errore deterministico.
- revoca libera slot e consente nuova creazione.

---

## Esclusioni esplicite (già in PLAN.md)

Non inclusi in questo REVIEW perché già pianificati:

- dedup webhook Stripe su `event.id`
- paginazione storico/export
- key rotation zero-downtime
- error envelope uniforme API
- TTL/revoca link pubblici ricevute
- enforcement limiti mensili Developer API
