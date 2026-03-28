# REVIEW — Analisi approfondita codice (security, performance, funzionalità, architettura)

Data analisi: 2026-03-28

## Metodo usato (passate iterative + criterio di stop)

Ho eseguito passate successive sul codice con questo criterio:

- **Passata X:** raccolta issue nuove.
- **Passata X+1:** ricerca mirata per verificare se emergono issue ulteriori non presenti in X.
- **Stop:** quando X+1 non aggiunge nuove issue rispetto a X.

### Esito passate

- **Passata 1:** 7 issue individuate.
- **Passata 2:** +3 issue nuove (non presenti in passata 1).
- **Passata 3:** +1 issue nuova (non presente in passata 2).
- **Passata 4:** **0 issue nuove** → criterio di stop raggiunto.

> Nota: come richiesto, ho **eliminato il precedente finding P0 sul rate limiting multi-instance**, assumendo deployment single-docker.

## Verifica preliminare rispetto a `PLAN.md`

Ho verificato i punti già in piano e li ho esclusi dal documento:

- dedup webhook Stripe su `event.id` (B1),
- paginazione storico/export (B2),
- key rotation zero-downtime (B3),
- error envelope API uniforme (B4).

---

## Priorità P1 (alta)

### P1-01 — Stripe billing sync: fallback silenzioso a `starter` su `priceId` sconosciuto

**Categoria:** Funzionalità critica, Integrità dati

**Evidenza tecnica**

- Nel webhook `syncSubscriptionData` usa fallback impliciti:
  - `planFromPriceId(priceId) ?? "starter"`
  - `intervalFromPriceId(priceId) ?? "month"`

**Impatto**

- Un `priceId` non mappato (nuovo prezzo o mismatch env) può assegnare piano/interval errati senza fail esplicito.

**Fix proposto (non ambiguo)**

1. Rimuovere fallback impliciti per piano/intervallo.
2. Se `priceId` è sconosciuto: non aggiornare `profiles.plan`; marcare evento come anomalia operativa.
3. Introdurre alerting e audit trail (`billing_sync_error`).

**Acceptance criteria**

- Test: `priceId` sconosciuto non modifica il piano utente.
- Test: evento anomalo produce log strutturato/alert.

---

### P1-02 — Limiti mensili Developer API definiti ma non applicati

**Categoria:** Business logic, Security economica (abuso quota)

**Evidenza tecnica**

- `DEVELOPER_MONTHLY_LIMITS` è definito in `src/lib/plans.ts` ma non risulta usato nei flussi `/api/v1/*`.

**Impatto**

- Piani developer possono superare i volumi contrattuali senza enforcement lato server.

**Fix proposto (non ambiguo)**

1. Introdurre contatore per business/profile su finestra mensile UTC.
2. Bloccare `POST /api/v1/receipts` quando limite piano è superato (errore esplicito quota exceeded).
3. Esporre nel payload risposta quota usata/residua.
4. Aggiungere job di reset/rollover mensile robusto (o query dinamica su range date).

**Acceptance criteria**

- Test: `developer_indie` blocca alla richiesta 301 del mese.
- Test: piani non developer non sono soggetti a questo limite.

---

### P1-03 — Assenza di vincoli DB forti su coerenza `api_keys.type` ↔ `business_id`

**Categoria:** Data integrity, Security hardening

**Evidenza tecnica**

- `api_keys.type` è text senza `CHECK` strutturale.
- Non è imposto a livello DB:
  - `business` ⇒ `business_id NOT NULL`
  - `management` ⇒ `business_id NULL`

**Impatto**

- Dati incoerenti possibili via migration/script/bug futuri.

**Fix proposto (non ambiguo)**

1. Introdurre enum DB `api_key_type` oppure `CHECK` stringente.
2. Aggiungere `CHECK` di coerenza con `business_id`.
3. Migrazione di remediation righe legacy incoerenti.

**Acceptance criteria**

- Insert/update incoerenti falliscono a livello DB.

---

### P1-04 — Possibile leakage di dati sensibili in log/Sentry su errori AdE

**Categoria:** Security, Privacy, Compliance

**Evidenza tecnica**

- In percorsi di errore emissione/annullo vengono loggati oggetti `adeResponse` completi.
- Hook logger inoltra error-level a Sentry con `extra` object.

**Impatto**

- Rischio di inviare payload fiscali non necessari verso sistemi terzi.

**Fix proposto (non ambiguo)**

1. Introdurre sanitizer dedicato payload AdE (whitelist campi tecnici).
2. Loggare solo metadati minimali (codici errore, id transazione, status).
3. Ridurre `extra` inviato a Sentry per questi eventi.

**Acceptance criteria**

- Snapshot test log: assenza campi sensibili (CF/PIN/password/payload raw).

---

### P1-05 — Input API ricevute senza limiti di dimensione/cardinalità (DoS logico/memoria)

**Categoria:** Security, Performance, Robustezza API

**Evidenza tecnica**

- Lo schema `POST /api/v1/receipts` valida tipi, ma non impone:
  - limite massimo righe,
  - limite lunghezza descrizioni,
  - limiti numerici superiori realistici su quantità/prezzi.

**Impatto**

- Payload molto grandi possono aumentare consumo CPU/memoria (parse JSON, mapping, insert DB, PDF/render futuri), causando degrado o timeout.

**Fix proposto (non ambiguo)**

1. Aggiungere vincoli Zod espliciti (es. max linee, max chars descrizione, range importi/quantità).
2. Validare anche body size massima lato route/runtime.
3. Introdurre errori 413/422 specifici per superamento limiti.

**Acceptance criteria**

- Test: payload oltre soglia restituisce errore deterministico senza processare AdE.
- Test: payload validi reali continuano a funzionare.

---

## Priorità P2 (media)

### P2-01 — Link pubblici ricevute permanenti senza revoca/scadenza

**Categoria:** Privacy by design, Security

**Evidenza tecnica**

- Accesso pubblico basato su UUID documento (`/r/[documentId]`, `/r/[documentId]/pdf`) senza TTL/revoca.

**Impatto**

- Un link condiviso accidentalmente resta valido indefinitamente.

**Fix proposto (non ambiguo)**

1. Introdurre token di share separato dal document ID.
2. Aggiungere `expires_at`, `revoked_at`, `last_accessed_at`.
3. Implementare rigenerazione/revoca da UI.

**Acceptance criteria**

- Test: link revocato/scaduto non accessibile.

---

### P2-02 — CORS preflight `OPTIONS` non gestito esplicitamente su API v1

**Categoria:** Funzionalità API, DX integrazioni browser

**Evidenza tecnica**

- CORS headers presenti in config, ma route `/api/v1/*` non espongono handler `OPTIONS` dedicato.

**Impatto**

- Integrazioni browser cross-origin con `Authorization` più fragili (preflight dipendente da comportamento runtime).

**Fix proposto (non ambiguo)**

1. Aggiungere `OPTIONS` su tutte le route `/api/v1/*`.
2. Centralizzare utilità CORS per evitare drift.

**Acceptance criteria**

- Test: `OPTIONS` ritorna 204 + header CORS attesi.

---

### P2-03 — Timeout/retry policy non uniforme per chiamate esterne non-AdE

**Categoria:** Affidabilità, Performance

**Evidenza tecnica**

- `RealAdeClient` ha timeout esplicito, ma altre integrazioni (es. verifica Turnstile) non mostrano policy uniforme di timeout/backoff.

**Impatto**

- Richieste lente o hanging su provider esterni possono degradare i tempi di risposta.

**Fix proposto (non ambiguo)**

1. Standardizzare wrapper per chiamate esterne con timeout hard.
2. Retry selettivo solo per errori transient.
3. Definire budget di latenza per endpoint critici.

**Acceptance criteria**

- Test con provider lento: timeout rispettato e risposta controllata.

---

### P2-04 — `getEffectivePlan` usa subscription pending per feature-gating API key

**Categoria:** Business logic, Authorization semantics

**Evidenza tecnica**

- `getEffectivePlan` può derivare piano da `subscriptions.stripePriceId` anche se `profiles.plan` è ancora `trial`.
- `createApiKey/listApiKeys` usano `getEffectivePlan` per il gate.

**Impatto**

- Accesso a funzioni “paid” potenzialmente anticipato a stato billing non consolidato (`pending`/pagamento non definitivo).

**Fix proposto (non ambiguo)**

1. Derivare piano effettivo solo da subscription in stato affidabile (`active`/eventuale `trialing` Stripe, se usato).
2. Escludere stati `pending`, `incomplete`, `past_due`, `canceled` dal feature gate premium.
3. Allineare test di billing-actions con matrice stati completa.

**Acceptance criteria**

- Test: subscription `pending` non abilita API key.
- Test: subscription `active` abilita correttamente.

---

## Priorità P3 (bassa)

### P3-01 — Sanitizzazione filename PDF incompleta in `Content-Disposition`

**Categoria:** Security hardening

**Evidenza tecnica**

- Il filename deriva da `adeProgressive` con sostituzione limitata di `/` e `\`.

**Impatto**

- Rischio basso ma non nullo di header malformati con caratteri speciali edge.

**Fix proposto (non ambiguo)**

1. Sanitizzazione whitelist (`[A-Za-z0-9._-]`) + fallback.
2. Aggiungere `filename*` RFC 5987.

**Acceptance criteria**

- Test header con caratteri speciali edge passa sempre in formato sicuro.

---

### P3-02 — Mancato controllo esplicito `event.livemode` nel webhook Stripe

**Categoria:** Hardening operativo

**Evidenza tecnica**

- Il webhook verifica la firma ma non valida in modo esplicito il contesto `livemode` rispetto all’ambiente atteso.

**Impatto**

- In scenari di misconfigurazione ambienti/secret, maggiore rischio di contaminazione dati tra contesti test/live.

**Fix proposto (non ambiguo)**

1. Aggiungere guardrail: confronto `event.livemode` con env (`STRIPE_EXPECT_LIVEMODE=true/false`).
2. Se mismatch: scartare evento con log warning strutturato.

**Acceptance criteria**

- Test: evento con `livemode` inatteso non modifica DB.

---

## Note operative finali

- Ordinamento priorità basato su combinazione di: impatto business, probabilità, facilità di exploit, costo del fix.
- Ogni item è scritto per essere implementabile in PR piccole, verificabili, con TDD.
