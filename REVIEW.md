# REVIEW — Analisi approfondita (sicurezza, performance, funzionalità, architettura)

## Metodo di analisi

- Revisione statica dei moduli critici: autenticazione/autorizzazione, API pubbliche, billing/Stripe, logica di emissione/annullo, crittografia, schema DB e server actions.
- Focus su failure mode reali: concorrenza, race condition, data leak cross-tenant, resilienza in produzione multi-replica, validazione input e trust boundaries.
- Ordinamento per priorità: **P0 (critico)**, **P1 (alto)**, **P2 (medio)**, **P3 (basso)**.

---

## P0 — Critico

### 1) Validazione hostname reset password vulnerabile a bypass via prefisso stringa

**Categoria:** Sicurezza (account security / phishing hardening)  
**Priorità:** P0

#### Evidenza

Nel flusso `resetPassword`, il link di recovery generato da Supabase viene validato con:

```ts
if (!actionLink.startsWith(`https://${expectedHostname}`)) {
  ...
}
```

Questo controllo è basato su prefisso stringa, non su parsing URL. Un host come `https://app.scontrinozero.it.attacker.tld/...` passa il controllo perché inizia con lo stesso prefisso.

#### Impatto

- In caso di misconfigurazione upstream (o di alterazione del link), può essere inviato all’utente un link di recupero password su dominio non fidato.
- Rischio phishing/credential theft/forced password reset su endpoint malevoli.

#### Istruzioni fix (precise per agente AI)

1. Parsare `actionLink` con `new URL(actionLink)`.
2. Confrontare `url.protocol === "https:"` e `url.hostname === expectedHostname` (uguaglianza esatta).
3. Opzionale consigliato: validare anche `url.pathname` atteso per recovery.
4. Gestire parsing failure con blocco invio email + log sicuro.
5. Aggiungere test unitario con casi malevoli:
   - `https://<expected>.evil.com/...` (deve fallire)
   - `https://evil.com/?next=https://<expected>` (deve fallire)
   - URL valido su hostname atteso (deve passare).

---

### 2) Race condition su annullo: possibile doppio VOID dello stesso SALE

**Categoria:** Integrità dati / Funzionalità / Concorrenza  
**Priorità:** P0

#### Evidenza

`voidReceiptForBusiness`:

- legge il SALE (`status === ACCEPTED`),
- poi inserisce un documento VOID idempotente per **idempotencyKey**,
- ma non esiste lock/constraint che impedisca due annulli concorrenti dello stesso documento con idempotency key diverse.

Due richieste parallele possono entrambe vedere SALE ancora `ACCEPTED` e procedere.

#### Impatto

- Possibile doppio annullo lato AdE (o stato locale incoerente in caso di esiti parziali).
- Violazione di regole fiscali/business: uno scontrino dovrebbe avere al più un annullo effettivo.

#### Istruzioni fix (precise per agente AI)

1. Introdurre vincolo DB esplicito che garantisca **unicità del VOID per documento origine** (es. colonna `voids_document_id` o tabella relazione con unique).
2. Eseguire check + insert in **un’unica transazione serializzabile** oppure con lock pessimista (`SELECT ... FOR UPDATE` sul SALE target).
3. Salvare nel VOID un riferimento al documento SALE annullato (oggi non è persistito in modo forte nello schema).
4. Se esiste già VOID riuscito/in corso per quel SALE, restituire risposta idempotente coerente.
5. Aggiungere test di concorrenza (due POST simultanei) che verifichi un solo annullo effettivo.

---

## P1 — Alto

### 3) Email non univoca a livello DB + precheck applicativo soggetto a race

**Categoria:** Sicurezza/Funzionalità account lifecycle  
**Priorità:** P1

#### Evidenza

- In `profiles` il campo `email` è `NOT NULL` ma **non UNIQUE**.
- In signup viene fatto precheck applicativo su `profiles.email`, che non protegge da race concorrenti.

#### Impatto

- Possibili profili multipli con stessa email (specialmente sotto carico/concorrenza).
- Problemi operativi: reset password, supporto, audit, riconciliazione utenti.
- Potenziali edge-case di sicurezza/identity confusion.

#### Istruzioni fix

1. Aggiungere vincolo DB `UNIQUE` su email normalizzata (`lower(email)` tramite indice univoco funzionale).
2. Normalizzare sempre email in input (`trim + lowercase`) in signup/signin/reset.
3. Gestire errore di unique violation nel signup restituendo messaggio user-friendly non enumerativo.
4. Migrazione dati pre-vincolo:
   - rilevare duplicati case-insensitive,
   - scegliere strategia di merge/retention esplicita.
5. Coprire con test di concorrenza/signup duplicate.

---

### 4) Idempotency key globale cross-tenant + lookup non scope-aware

**Categoria:** Architettura API / Data isolation  
**Priorità:** P1

#### Evidenza

- `commercial_documents.idempotency_key` è unico globalmente.
- In caso di conflitto, `emitReceiptForBusiness` e `voidReceiptForBusiness` rileggono per `idempotencyKey` senza filtrare per business/profile.

#### Impatto

- Architettura non multi-tenant friendly: collisione (anche accidentale) tra tenant blocca l’operazione.
- Potenziale leak di metadati in caso teorico di key nota/collisione (ritorno di `documentId`/status di record non proprio).

#### Istruzioni fix

1. Ridefinire idempotency scope: `(business_id, idempotency_key)` unico invece che globale.
2. In fallback di conflitto, filtrare sempre per `businessId` (e, dove utile, `kind`).
3. Se conflitto fuori scope, restituire errore neutro senza dati documento.
4. Aggiornare test API idempotency con casi cross-business.

---

### 5) Rate limiting in-memory non adatto a produzione distribuita

**Categoria:** Sicurezza anti-abuso / Architettura operativa  
**Priorità:** P1

#### Evidenza

`RateLimiter` usa `Map` in processo Node con timer locale. I limiter vengono istanziati in modulo route/action.

#### Impatto

- Bypass semplice in deploy multi-instance (limite per pod/processo, non globale).
- Reset automatico al restart/deploy.
- Efficacia ridotta contro brute-force/abuso API.

#### Istruzioni fix

1. Portare rate-limit su store condiviso (Redis/Upstash/KeyDB/Postgres advisory design).
2. Rendere atomica l’operazione increment+expire.
3. Esporre header standard (`Retry-After`, eventualmente `X-RateLimit-*`).
4. Definire chiavi per use-case (`ip`, `userId`, `apiKeyId`) con trust model esplicito.
5. Mantenere un fallback locale solo per dev/test.

---

## P2 — Medio

### 6) Trust model IP fragile se header Cloudflare assente (spoof X-Forwarded-For)

**Categoria:** Sicurezza anti-abuso  
**Priorità:** P2

#### Evidenza

`getClientIp` usa:

1. `cf-connecting-ip`
2. fallback a primo `x-forwarded-for`
3. `unknown`

In produzione assume che Cloudflare header sia sempre presente; se non lo fosse per misconfigurazione, un client può falsificare XFF.

#### Impatto

- Bypass/erosione rate-limit e correlazione audit IP.

#### Istruzioni fix

1. In `NODE_ENV=production`, accettare solo header da proxy trusted configurato esplicitamente.
2. Se trust chain non valida, usare `unknown` o bloccare endpoint sensibili.
3. Documentare e testare scenari con/without CF header.

---

### 7) Nessuna deduplica esplicita webhook Stripe su event.id

**Categoria:** Robustezza integrazione esterna  
**Priorità:** P2

#### Evidenza

Webhooks Stripe verificano firma ma non persistono `event.id` processati.
Stripe può inviare retry/duplicati.

#### Impatto

- Aggiornamenti ripetuti non sempre dannosi, ma aumentano fragilità e side effect indesiderati (log, scritture ridondanti, possibili race tra eventi out-of-order).

#### Istruzioni fix

1. Introdurre tabella `stripe_webhook_events(event_id unique, processed_at, type, status)`.
2. Prima di processare: insert-if-not-exists atomico.
3. Gestire out-of-order con regole di precedenza stato chiare.
4. Aggiungere test su duplicate delivery.

---

### 8) Query potenzialmente non scalabili (assenza paginazione su storico/export)

**Categoria:** Performance / Scalabilità  
**Priorità:** P2

#### Evidenza

- `searchReceipts` carica tutti i documenti + tutte le linee in memoria.
- `exportUserData` esporta dataset completo senza limiti/chunking.

#### Impatto

- Latency elevata e memory pressure su tenant con storico ampio.
- Rischio timeout in serverless/edge constraints.

#### Istruzioni fix

1. Introdurre paginazione cursor-based su storico (`limit`, `cursor`).
2. Per export voluminosi: job asincrono + file temporaneo + notifica completamento.
3. Aggiungere limiti massimi server-side e osservabilità (metriche su durata/volume).
4. Verificare presenza di indici composti coerenti coi filtri principali.

---

## P3 — Basso / Miglioramento

### 9) Gestione key rotation cifratura non “zero-downtime”

**Categoria:** Sicurezza operativa / Manutenibilità  
**Priorità:** P3

#### Evidenza

Il codice stesso documenta che `decrypt` mappa `cred.keyVersion` sempre alla chiave corrente (`getEncryptionKey()`), impedendo rotazioni graduali sicure.

#### Impatto

- Rotazione chiavi complessa, con rischio incidenti operativi/decrypt failure.

#### Istruzioni fix

1. Supportare più chiavi attive via env (`ENCRYPTION_KEYS_JSON` o schema equivalente).
2. Costruire map `version -> key` reale in runtime.
3. Implementare comando di re-encryption progressiva e fallback read-old/write-new.
4. Documentare runbook operativo di rotazione.

---

### 10) Uniformare gestione errori esterni (Stripe/Resend/AdE) per resilienza observability-first

**Categoria:** Architettura / Best practices  
**Priorità:** P3

#### Evidenza

In diversi endpoint alcune chiamate esterne possono propagare eccezioni a 500 generico senza envelope uniforme e senza correlazione esplicita request-level.

#### Impatto

- Debug più difficile, UX API non consistente.

#### Istruzioni fix

1. Standardizzare error envelope API (`code`, `message`, `requestId`).
2. Wrapping coerente delle integrazioni con classificazione errori (transient/permanent).
3. Aggiungere circuit-breaker/retry policy mirata dove sensato.

---

## Raccomandazioni di esecuzione (ordine consigliato)

1. **P0.1** Fix validazione hostname reset password.
2. **P0.2** Protezione forte contro doppio VOID (schema + transazioni/lock).
3. **P1.3** Unicità email + normalizzazione + migrazione dedup.
4. **P1.4** Re-scope idempotency key a livello business.
5. **P1.5** Rate limit distribuito.
6. **P2** Hardening IP trust, dedup webhook, paginazione/export async.
7. **P3** Rotazione chiavi e uniformazione error handling.

---

## Nota finale

Se vuoi, nel prossimo step posso trasformare questo review in un **piano operativo eseguibile** (ticket-by-ticket), includendo per ogni finding:

- checklist tecnica,
- file da toccare,
- migrazioni SQL,
- test da aggiungere,
- criteri di accettazione (DoD) pronti per CI.
