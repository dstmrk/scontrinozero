# REVIEW.md — Registro bug noti e tech debt

> **Data ultimo audit:** 2026-06-09 · **Versione analizzata:** v1.3.8 (commit `dc03ed5`)
>
> **Scopo.** Questo file è il **registro canonico** dei bug noti, del tech debt e dei
> miglioramenti di sicurezza/performance, ordinati per priorità (P1/P2/P3).
> `PLAN.md` resta la roadmap delle **funzionalità**. Quando un finding viene risolto,
> rimuoverlo da qui nel PR del fix; quando un audit ne trova di nuovi, aggiungerli
> nella sezione di priorità corretta.
>
> **Metodologia dell'audit 2026-06-09:** analisi in parallelo su tre assi (sicurezza ·
> performance/architettura · correttezza funzionale/bad practices), seguita da verifica
> manuale di ogni finding sul codice corrente. Falsi positivi scartati (es. riuso
> idempotency key con payload diverso — già gestito via `requestHash`,
> `IDEMPOTENCY_PAYLOAD_MISMATCH`; indice UNIQUE sui VOID — già corretto in migration
> `0012`; `RateLimiter` senza bound — ha già cap 50k chiavi + eviction FIFO).
>
> Ogni finding è autoconsistente: un agente AI deve poter implementare il fix leggendo
> solo la sezione, nel rispetto delle regole sempre-attive di `CLAUDE.md` (branch
> separato, TDD, edge case prima del commit, task > 3 file → sub-task).

**Postura complessiva: buona.** RLS Supabase, ownership check (`checkBusinessOwnership`),
sanitizzazione log/Sentry, validazione redirect AdE (`resolveAdeRedirect` +
`ADE_ALLOWED_HOSTS`), firma webhook Stripe con claim atomico, body-size guard e
crittografia AES-256-GCM sono risultati solidi alla verifica. I finding sotto sono
miglioramenti mirati, non vulnerabilità critiche.

---

## P1 — Alta priorità

### 3. Enforcement limiti mensili Developer API assente

- **Categoria:** sicurezza/billing · **Severità:** High — **gate: blocca il lancio dei developer plan (v2.0.0)**
- **File:** `src/lib/plans-shared.ts:159` (`DEVELOPER_MONTHLY_LIMITS`, definito ma mai applicato); handler `src/app/api/v1/receipts/route.ts` e `src/app/api/v1/receipts/[id]/void/route.ts`; auth `src/lib/api-auth.ts`

**Problema.** `DEVELOPER_MONTHLY_LIMITS` (300/1500/5000 emissioni/mese per
`developer_indie`/`developer_business`/`developer_scale`) è definito e testato
(`plans.test.ts:267-276`) ma **nessun endpoint lo applica**: un developer plan può
emettere senza limite. Oggi è teorico (i piani developer non sono in vendita), ma
diventa un buco di billing al lancio della Fase B Developer API.

**Fix (non ambiguo).**

1. Contatore per-business su finestra **mensile UTC**: query `COUNT(*)` su
   `commercial_documents WHERE business_id = $1 AND kind='SALE' AND created_at >= date_trunc('month', now() AT TIME ZONE 'UTC')`
   oppure (preferibile per costo) tabella contatore dedicata incrementata
   nell'INSERT del documento, azzerata implicitamente dalla chiave
   `(business_id, year_month)`.
2. Check nel flusso emit (dopo auth, prima dell'INSERT): alla soglia, errore
   esplicito `429` con code `MONTHLY_LIMIT_EXCEEDED` e quota residua nel payload
   di tutte le risposte (`X-Monthly-Quota-Remaining` o campo JSON).
3. Solo per i piani presenti in `DEVELOPER_MONTHLY_LIMITS` (gli altri sono
   `undefined` → nessun limite).
4. **Test:** sotto soglia → OK; alla soglia → 429; cambio mese UTC → reset;
   piani non-developer → mai limitati; concorrenza alla soglia (due emit
   simultanee al limite-1 → al massimo una passa, accettabile off-by-one
   documentato oppure contatore atomico con `UPDATE ... RETURNING`).
5. Da implementare **contestualmente al lancio dei developer plan in v2.0.0**
   (non prima: nessun utente ha questi piani oggi).

---

## P2 — Media priorità

### 4. Recovery stale può ri-emettere un documento già accettato da AdE (manca lookup pre-retry via `searchDocuments`)

- **Categoria:** correttezza fiscale/idempotenza · **Severità:** High (probabilità bassa, impatto irreversibile)
- **File:** `src/lib/services/receipt-service.ts:395` e `src/lib/services/void-service.ts:573` (commenti che documentano il gap); `src/lib/services/ade-recovery.ts:18`; client già pronti: `src/lib/ade/client.ts:79` (`searchDocuments` nell'interfaccia), `src/lib/ade/real-client.ts:1205`, `src/lib/ade/mock-client.ts:119`

**Problema.** La soglia stale (30 min) + il claim CAS su `updatedAt` serializzano i
retry concorrenti, ma resta la finestra: **AdE ha accettato e la response (o il
processo) si è persa prima della UPDATE finale** → il documento resta `PENDING`
senza `adeTransactionId`, e la recovery successiva ri-esegue `submitSale`/`submitVoid`
creando un **documento fiscale duplicato e irreversibile** su AdE.

**Fix (non ambiguo).**

1. In `recoverStaleReceipt` (receipt-service) e nell'equivalente void, **prima** di
   ri-sottomettere: chiamare `adeClient.searchDocuments(...)` (già implementato in
   entrambi i client, HAR di riferimento `ricerca_documento.har`) filtrando per la
   finestra temporale del documento e riconciliare per campi chiave (data, importo
   totale, eventuale `idtrx` parziale).
2. Match trovato → **finalize-only**: UPDATE a `ACCEPTED` con
   `adeTransactionId`/`adeProgressive` recuperati, senza ri-emettere.
   Nessun match → procedere con la ri-sottomissione come oggi.
3. Lookup fallito (rete/AdE down) → NON ri-sottomettere: lasciare PENDING e
   ritornare `PENDING_IN_PROGRESS` (fail-safe: meglio un retry dopo che un
   duplicato fiscale).
4. **Test:** match esatto → finalize-only e `submitSale` NON chiamata; nessun
   match → submit come oggi; `searchDocuments` che lancia → niente submit, errore
   transiente; match ambiguo (due documenti stesso importo stessa finestra) →
   comportamento conservativo documentato (non finalizzare, log `warn` +
   `PENDING_IN_PROGRESS`).
5. Mantenere coerenza con il design del riuso sessione AdE (item 5): il lookup
   avviene dentro la stessa sessione/login dell'eventuale submit.

---

### 11. `getCatalogItems` senza LIMIT + autocomplete server-side

- **Categoria:** performance/scalabilità · **Severità:** Medium · **Target: v1.7.0** (insieme a "Catalogo: modifica prodotto + sync AdE", già in roadmap PLAN.md)
- **File:** `src/server/catalog-actions.ts:86-90` (SELECT senza LIMIT); consumer: `src/app/dashboard/page.tsx:26`, `src/components/catalogo/catalogo-client.tsx`, Combobox prodotti della cassa

**Problema.** La query carica l'intero catalogo a ogni apertura del POS. Per un
piano Pro illimitato con 5–10k articoli sono 1–5MB di JSON RSC per render, più il
costo del DOM per la lista completa lato client.

**Fix (non ambiguo).**

1. API: `getCatalogItems(businessId, { q?, limit?, offset? })` con `limit`
   clampato (es. 100) e filtro `ILIKE` su `description` per l'autocomplete.
2. UI: Combobox prodotti → autocomplete con search debounced (`useTransition`),
   skill `react-patterns`.
3. Il piano Starter (max 5 prodotti) non cambia comportamento percepito.
4. **Test:** limit clampato, query con `q` case-insensitive, lista vuota, business
   con più item del limit (nessun item "perso" nella search).

---

### 12. Paginazione cursor-based su storico, export e Developer API

- **Categoria:** performance/scalabilità · **Severità:** Medium (cresce col volume per-tenant)
- **File:** `src/server/storico-actions.ts:39-113` (`searchReceipts`: offset-based + `COUNT(*)` per request); `src/server/export-actions.ts:78+` (`exportUserData`: export senza limiti); `src/app/api/v1/receipts/route.ts:246-260` (clamp silenzioso di `page`/`limit`/`kind`) e `:292-296` (`COUNT(*)` full-match a ogni richiesta paginata)

**Problema.** Tre facce dello stesso debt:

1. `searchReceipts` e `GET /api/v1/receipts` usano LIMIT/OFFSET + un `COUNT(*)`
   che scansiona l'intero match a **ogni** pagina richiesta: con 100k+ documenti
   per business la latenza è dominata dal count.
2. `exportUserData` carica tutti i documenti senza bound (rischio OOM su tenant
   grandi).
3. I parametri `page`/`limit`/`kind` dell'API sono clampati silenziosamente
   (`page=-100` → 200 con `page=1`) invece di essere rifiutati.

**Fix (non ambiguo).**

1. Cursor-based: `nextCursor` = `(createdAt, id)` dell'ultimo elemento, query
   `WHERE (created_at, id) < ($cursor)` — sfrutta l'indice composito
   `idx_commercial_documents_business_created` esistente.
2. **Breaking change Developer API** da gestire esplicitamente: rendere `total`
   opt-in (`includeTotal=true`) o sostituirlo con `nextCursor`/`limit+1`;
   aggiornare `docs/api-spec.md` e `DEVELOPER.md`.
3. Validare `page`/`limit`/`kind` con schema Zod che rifiuta valori invalidi con
   **400** (niente clamp silenzioso); stesso schema condiviso con la server
   action (vedi item 18).
4. Export: stream/chunking con bound esplicito (es. batch da 1000 con cursore) e
   limite documentato.
5. **Test:** cursore stabile sotto insert concorrenti; pagina vuota; `400` su
   `page=abc`/`limit=-1`/`kind=FOO`; export con N > batch size.
6. Da affrontare **quando il volume per-tenant lo richiede** — monitorare p95
   della lista storico.

---

### 13. Eliminare `'unsafe-inline'` da `script-src` (CSP)

- **Categoria:** sicurezza/hardening · **Severità:** Medium
- **File:** `src/lib/csp.ts:27`; payload JSON-LD: `softwareApplicationJsonLd`, `organizationJsonLd`, `faqPageJsonLd` e breadcrumb degli help dinamici (grep `application/ld+json` in `src/app/(marketing)` e `src/components`)

**Problema.** `script-src 'self' 'unsafe-inline' challenges.cloudflare.com`
neutralizza gran parte del valore della CSP contro XSS: qualsiasi inline script
iniettato verrebbe eseguito. Oggi è mitigato da `safeJsonLd()` (escaping) e dal
fatto che i payload sono statici, ma è un single point of failure.

**Fix (Path A — hash, deciso; Path B nonce scartato perché incompatibile con SSG marketing).**

1. Precomputare gli SHA-256 dei payload JSON-LD inline (build-time o test che
   genera/verifica gli hash) e includerli in `buildCsp()` come `'sha256-XXX'` al
   posto di `'unsafe-inline'`.
2. Fragilità nota: ogni edit ai JSON-LD ricalcola gli hash → aggiungere un test
   che fallisce con messaggio esplicito quando un payload cambia senza aggiornare
   l'hash (così il drift si vede in CI, non in produzione con script bloccati).
3. `'unsafe-inline'` su **style-src resta** (Tailwind 4 + Radix UI, fuori scope).
4. Da affrontare quando la frequenza di edit dei JSON-LD è bassa; verificare su
   sandbox prima di prod (uno script bloccato dalla CSP rompe il widget Turnstile
   o i dati strutturati silenziosamente — controllare la console e i report CSP).

---

## P3 — Bassa priorità

### 17. Key rotation zero-downtime: i caller passano sempre una sola chiave

- **Categoria:** sicurezza/operatività · **Severità:** Low (finché non serve ruotare)
- **File:** `src/lib/crypto.ts:103` (`getEncryptionKey`), `:142` (doc del pattern); caller: `src/lib/server-auth.ts:123-127`, `src/server/onboarding-actions.ts:267,349,610`; script esistente: `scripts/rotate-encryption-key.ts`

**Problema.** `decrypt()` supporta già `Map<number, Buffer>` multi-versione, ma
tutti i caller costruiscono `new Map([[row.keyVersion, getEncryptionKey()]])`:
mappano la versione **memorizzata** sulla chiave **corrente**. Dopo una rotazione
di `ENCRYPTION_KEY` le credenziali cifrate con la versione precedente diventano
illeggibili (decrypt fallisce) finché non si ri-cifra tutto: la rotazione
zero-downtime è impossibile nello stato attuale dei caller.

**Fix (non ambiguo).**

1. Introdurre `getEncryptionKeys(): Map<number, Buffer>` in `crypto.ts` che legge
   la chiave corrente (`ENCRYPTION_KEY` + `ENCRYPTION_KEY_VERSION`) e,
   opzionalmente, la precedente (`ENCRYPTION_KEY_PREVIOUS` +
   `ENCRYPTION_KEY_PREVIOUS_VERSION`), con validazione fail-fast coerente con
   `getEncryptionKey`.
2. Migrare i 4 caller a `decrypt(payload, getEncryptionKeys())`.
3. Runbook documentato (in `scripts/rotate-encryption-key.ts` header o
   `docs/`): (a) deploy con entrambe le chiavi in env; (b) run
   `rotate-encryption-key.ts` che ri-cifra le righe `key_version` vecchia;
   (c) rimozione della chiave precedente dall'env.
4. **Test E2E:** cifra con v1 → rotazione → decrypt con Map {1: old, 2: new}
   funziona; dopo re-encryption decrypt con sola v2 funziona; chiave mancante per
   una versione presente nel DB → errore esplicito (non silent garbage).

---

### 18. Error envelope uniforme API

- **Categoria:** architettura/manutenibilità · **Severità:** Low
- **File:** envelope: tutti gli endpoint `src/app/api/**`

> **Schema Zod SALE condiviso: RISOLTO.** Lo schema linea + base SALE è stato
> estratto in `src/lib/receipts/receipt-schema.ts` (`saleLineSchema`,
> `saleBodySchema` + field schema riusabili): la route API lo usa diretto, la
> server action ricompone aggiungendo solo `id` (UI) e `businessId`. Resta
> aperta la sola standardizzazione dell'envelope d'errore.

**Problema.** Le risposte d'errore API non hanno una shape uniforme (`{error}`
vs `{error, code}` vs status diversi per lo stesso caso).

**Fix (non ambiguo).**

1. Standardizzare l'envelope: `{ code, message, requestId }` su tutti gli endpoint
   `/api/v1/*` (e progressivamente gli altri), con classificazione
   transient/permanent per gli errori delle integrazioni esterne (coerente con
   regola 10). `requestId` = correlazione log (già presente nel logger o da
   generare per-request).
2. Aggiornare `docs/api-spec.md` con l'envelope.
3. **Test:** snapshot dell'envelope per gli error path principali (400, 401, 404,
   409, 429, 503).

---

### 19. CAPTCHA: hostname Turnstile extra configurabili via env

- **Categoria:** operatività · **Severità:** Low — solo se si aggiunge un terzo ambiente (staging/preview)
- **File:** `src/server/auth-actions.ts:125-133` (`getAcceptedTurnstileHostnames`)

**Problema.** L'allowlist degli hostname Turnstile è già un Set (app + marketing +
www, derivati dalle env d'identità), ma non è estensibile senza modificare il
codice: un eventuale staging/preview con hostname proprio richiederebbe un deploy.

**Fix (non ambiguo).**

1. Supportare una env opzionale `TURNSTILE_ALLOWED_HOSTNAMES` (comma-separated)
   i cui valori — validati con `parseTrustedHostnameEnv`-like (no schema, no
   porta, lowercase) — vengono **aggiunti** al Set derivato; env assente = zero
   cambiamenti.
2. **Test:** env assente → Set invariato; env con 2 hostname → inclusi; valore
   malformato → ignorato con `warn` (mai fail-open con stringa vuota, regola 18:
   present-but-empty).

---

### 20. Stripe: recovery dei claim webhook rimasti "stuck"

- **Categoria:** resilienza billing · **Severità:** Low (caso doppio-fallimento)
- **File:** `src/app/api/stripe/webhook/route.ts:130-148` (`processWithClaimRelease`: su DELETE fallita il claim resta permanente)

**Problema.** Se `handleEvent` fallisce **e** anche la DELETE del claim fallisce,
l'evento resta in `stripe_webhook_events` con claim permanente: Stripe ritenta ma
ogni retry vede il claim e risponde 200 (skip). Oggi il rimedio è manuale
(`DELETE FROM stripe_webhook_events WHERE event_id = ...`, documentato nel
commento a route.ts:127-128).

**Fix (non ambiguo).**

1. Job periodico (cron in-container, es. `setInterval` unref'd in
   `instrumentation.ts` o script schedulato) che elimina i claim più vecchi di N
   minuti **senza esito di processing completato**. Richiede distinguere "claim
   in corso" da "processed": aggiungere colonna `processed_at` (migration
   handwritten) valorizzata a fine `handleEvent`; il job elimina righe con
   `processed_at IS NULL AND created_at < now() - interval '30 minutes'`.
2. Lo sweep deve loggare `warn` con gli `event_id` sbloccati (visibilità su
   quanti eventi finiscono stuck).
3. **Test:** claim stuck oltre soglia → eliminato; claim fresco → intatto;
   processed → mai eliminato (dedup permanente preservata).

---

### 21. Stripe checkout: customer orfani su richieste concorrenti + idempotency

- **Categoria:** resilienza billing · **Severità:** Low · **Target indicativo:** v1.4.0+
- **File:** `src/app/api/stripe/checkout/route.ts:53-55` (`stripe.customers.create` prima del claim DB)

**Problema.** Due checkout concorrenti dello stesso utente senza
`stripeCustomerId` creano entrambi un customer Stripe prima che il vincitore salvi
l'id nel DB: il perdente lascia un customer orfano su Stripe. Manca inoltre un
guard su subscription già attiva/pending e un'idempotency key Stripe.

**Fix (non ambiguo).**

1. Claim preventivo in DB prima della create (es. `UPDATE profiles SET stripe_customer_id = 'creating' WHERE ... AND stripe_customer_id IS NULL RETURNING`,
   o colonna di stato dedicata): solo il vincitore crea il customer; il perdente
   rilegge e riusa.
2. Guard: se esiste già una subscription attiva o un checkout pending → 409 con
   messaggio esplicito (niente doppio abbonamento).
3. `idempotencyKey` Stripe su `customers.create` e `checkout.sessions.create`
   (derivata da `userId` + finestra temporale) come seconda difesa.
4. **Test:** due richieste concorrenti → un solo customer creato (mock Stripe con
   contatore); retry dopo crash a metà → riusa il customer; subscription attiva → 409.

---

### 23. Indice composito `api_keys (business_id, revoked_at)`

- **Categoria:** performance DB · **Severità:** Low · **Target: v2.0.0+** (Developer API Fase B)
- **File:** `src/server/api-key-actions.ts:23` (`listApiKeys`); migration nuova

**Problema.** `listApiKeys()` filtra per business e chiavi non revocate senza
indice dedicato. Con la cardinalità attuale (1–2 chiavi/business) l'impatto è ~0;
diventa rilevante con i piani Developer multi-key (10–50 chiavi/business, tabella

> 10k righe).

**Fix.** Partial index `CREATE INDEX ... ON api_keys (business_id) WHERE revoked_at IS NULL`
(migration handwritten). Da fare insieme alla Fase B, non prima.

---

### 24. Centralizzare policy retry/timeout sulle chiamate esterne

- **Categoria:** architettura · **Severità:** Low — al prossimo provider esterno nuovo
- **File:** pattern divergenti in `src/server/auth-actions.ts` (backoff su auth user delete), `src/lib/ade/real-client.ts` (retry sessione AdE), `src/lib/email.ts` (timeout via `Promise.race`), `src/lib/db-timeout.ts` (`retryOnStatementTimeout`)

**Problema.** Quattro implementazioni simili ma divergenti di retry/timeout:
backoff diversi, log shape diversi, error class non uniformi. Ogni nuovo call-site
copia una delle varianti e il drift cresce.

**Fix (non ambiguo).**

1. Due utility comuni in `src/lib/`:
   `retryTransient({ attempts, baseDelayMs, jitter, classifyError }, fn)` e
   `withExternalTimeout(ms, fn)`.
2. Convenzione log fields: `errorClass`, `provider`, `operation`, `retryAttempt`.
3. Migrazione **progressiva** dei call-site (non big-bang): iniziare dal prossimo
   provider nuovo (es. CIE login, AdE search) e migrare gli esistenti quando si
   toccano per altri motivi.
4. **Test:** le utility (attempts, jitter bounds, classify), non i call-site
   migrati uno a uno.

---

### 25. `waitUntil` per il fire-and-forget di `last_used_at`

- **Categoria:** robustezza futura · **Severità:** Low — solo al secondo target di deploy
- **File:** `src/lib/api-auth.ts:144-155` (`db.update(...).catch(...)` fire-and-forget)

**Problema.** L'update di `last_used_at` è fire-and-forget: corretto sul container
Node long-running attuale, ma su un futuro deploy Edge/serverless il contesto può
essere terminato prima del flush e l'update perso sistematicamente.

**Fix.** Quando (se) si introduce un secondo target di deploy:
`import { waitUntil } from "next/server"` e wrappare la promise. Nessuna azione
oggi — il finding esiste per non perderlo nel refactor.

---

### 26. Segnale di fallimento per le email auth inviate fire-and-forget

- **Categoria:** UX flusso critico · **Severità:** Low
- **File:** `src/server/auth-actions.ts:639` (reset password), `src/server/onboarding-actions.ts:490` (welcome/operator), `src/server/account-actions.ts:119` (deletion) — tutti `void sendEmail(...).catch(log)`

**Problema.** L'invio è fire-and-forget e l'utente viene comunque reindirizzato a
"controlla la tua email": se Resend fallisce, attende un'email che non arriverà e
finisce al supporto. Il vincolo è non rompere l'**anti-enumeration** (la risposta
non deve rivelare se l'email esiste).

**Fix (non ambiguo).**

1. Per il **reset password** (l'unico flusso dove l'utente aspetta attivamente):
   attendere l'esito di `sendEmail` con timeout breve (es. 3s via
   `withExternalTimeout`, item 24); su fallimento mostrare un banner neutro
   "Se l'indirizzo è registrato riceverai un'email. Non arriva? Riprova tra
   qualche minuto." — identico per email esistente/inesistente quando l'invio
   riesce, quindi nessun oracle.
2. Welcome/operator/deletion possono restare fire-and-forget (non bloccano
   l'utente); assicurarsi che il `.catch` logghi `warn` con `errorClass`
   (`email_send_failed`) per l'osservabilità.
3. **Test:** Resend KO su reset → banner di retry, nessuna differenza di
   messaggio tra email esistente e no; Resend OK → redirect invariato.

---

### 28. SPID: allowlist host IdP prima del wiring di `loginSpid`

- **Categoria:** sicurezza · **Severità:** Low oggi (SPID non cablato) — **bloccante al lancio v1.8.0**
- **File:** `src/lib/ade/real-client.ts:55` (`ADE_ALLOWED_HOSTS`, modello da replicare), `:657` (`parseFormAction`), `:769` (`spidPostCredentials`), `:988`, `:1060`

**Problema.** Il flusso documenti valida i redirect con `resolveAdeRedirect` +
`ADE_ALLOWED_HOSTS`, ma il flusso SPID segue e POSTa verso URL derivati dall'HTML
del SP AdE (`parseFormAction`) e dagli header `Location` dell'IdP **senza
allowlist** — e `spidPostCredentials` invia codice fiscale + password SPID a
`loginformUrl`. Se l'HTML del SP o un redirect IdP fosse manomesso/misconfigurato,
le credenziali finirebbero su un host arbitrario (il TLS verso AdE mitiga in
pratica).

**Fix (non ambiguo).**

1. **Insieme** al wiring di `loginSpid` (v1.8.0): allowlist `SPID_ALLOWED_IDP_HOSTS`
   con gli hostname degli IdP SPID noti (es. `identity.sieltecloud.it` + gli
   altri provider), analoga a `ADE_ALLOWED_HOSTS`.
2. Validare **ogni** URL di `parseFormAction` e ogni `Location` del flusso SPID
   contro `ADE_ALLOWED_HOSTS ∪ SPID_ALLOWED_IDP_HOSTS` prima di seguirlo;
   `spidPostCredentials` deve rifiutare (errore esplicito, mai degradare) host
   fuori allowlist.
3. _Da confermare al momento dell'attivazione SPID_ con HAR reali per la lista
   IdP (regola 14).
4. **Test:** form action verso host fuori allowlist → throw senza POST; host
   valido → flusso invariato.

---

### 30. Bonifica `businesses.vatNumber`/`fiscalCode` sovrascritti prima dell'identity guard

- **Categoria:** correttezza/dati fiscali · **Severità:** Low (prevenzione già fatta) — **da indagare solo se ci sono account impattati**
- **File:** `src/server/onboarding-actions.ts` (`verifyAdeCredentials`); dati in `businesses`/`commercial_documents`

**Contesto.** Fino al fix dell'identity guard (cambio credenziali Fisconline verso
una P.IVA diversa ora bloccato), `verifyAdeCredentials` sovrascriveva
**incondizionatamente** `businesses.vatNumber`/`fiscalCode` con la P.IVA delle nuove
credenziali. Poiché gli scontrini non salvano uno snapshot fiscale e leggono **live**
`businesses.vatNumber` (storico, PDF, pagina pubblica, CSV), un eventuale account che
in passato avesse cambiato credenziali verso un soggetto diverso ora mostrerebbe la
**P.IVA errata** sugli scontrini emessi sotto la P.IVA originale.

**⚠️ La P.IVA trasmessa NON è tracciata per-scontrino.**
`commercial_documents.adeResponse` contiene solo `AdeResponse` =
`{ esito, idtrx, progressivo, errori }` (`src/lib/ade/types.ts:162`), **non** il
`cedentePrestatore`. Tutte le copie della P.IVA nel DB sono live e già sovrascritte
insieme (`businesses.vat_number`/`fiscal_code`, `profiles.partita_iva`);
`ade_credentials` tiene solo le credenziali correnti. Di conseguenza **non è
possibile identificare con certezza dal nostro DB quali scontrini furono emessi
sotto una P.IVA precedente**: l'unica fonte di verità sulla P.IVA trasmessa è
l'AdE (i documenti sono archiviati lì sotto la vecchia P.IVA).

**Fix (indagine).** Solo un **set di candidati sospetti** da verificare poi
manualmente contro l'AdE — nessun rilevamento definitivo via SQL:

1. **Segnale forte (da calibrare sul dato reale):** salto all'indietro del
   `progressivo` AdE (`ade_progressive`) nella storia di uno stesso `business_id`,
   non al confine d'anno. L'AdE assegna i progressivi per cedente: un reset a metà
   storia suggerisce un cambio di soggetto fiscale. Prima campionare il formato del
   campo (`SELECT business_id, ade_progressive, created_at FROM commercial_documents
WHERE kind='SALE' AND status='ACCEPTED' AND ade_progressive IS NOT NULL ORDER BY
business_id, created_at`) poi disegnare l'euristica del salto.
2. **Segnale debole:** `ade_credentials.updated_at` successivo al primo scontrino —
   cattura anche le legittime rotazioni password (molti falsi positivi), usabile
   solo come filtro grossolano.
3. Per ogni candidato, **cross-check manuale contro l'AdE** (P.IVA effettiva sotto
   cui risultano i documenti) prima di qualsiasi azione.
4. Se nessun candidato → chiudere la voce (la prevenzione basta).
5. Se confermati → decidere la strategia con l'utente: tocca dati fiscali, non
   automatizzabile alla cieca (regola 13). Opzione strutturale a monte: aggiungere
   uno **snapshot fiscale per-scontrino** (P.IVA/CF del cedente all'emissione) così
   da rendere futuri cambi tracciabili e i PDF storici fedeli.

---

### 32. SCONTRINOZERO-M — `wizardTemplate` ritorna `200` con lista `PIva` vuota su login Fisconline

- **Categoria:** correttezza/osservabilità · **Severità:** Low — 1 evento in produzione, root cause non confermata
- **File:** `src/lib/ade/real-client.ts` (`fetchWizardPiva`, Phase F del login Fisconline)

**Problema.** `fetchWizardPiva` lancia `AdePortalError(200, "Failed to extract
P.IVA from wizardTemplate response")` quando `data?.PIva?.[0]?.piva` è falsy su
una response `200` valida. Status `200` ⇒ né `isTransientAdeError` né
`isExpectedUserAdeError` ⇒ classificato `ade_failure` ⇒ Sentry (corretto: errore
inatteso). Osservato **~5 minuti dopo** che l'utente aveva cambiato una password
Fisconline scaduta (timeline pino: `ade:auth_failed` → `ade:password_expired`
×2 → "Password Fisconline aggiornata con successo" → fallimento emit-receipt).
**Ipotesi principale:** stato transient lato AdE post-cambio-password (sessione/
entitlement non ancora propagati), **non** un cambio di shape globale (colpirebbe
tutti i login) né un account permanentemente senza P.IVA (l'utente aveva
onboardato correttamente via lo stesso Phase F). SPID non è attivo: il path è
sicuramente Fisconline.

**Stato.** Aggiunta diagnostica struttura-only (no PII) prima del throw —
`logger.warn(..., "ade:wizard_piva_missing")` con `contentType` / `topLevelKeys`
/ `pIvaIsArray` / `pIvaLength` / `firstEntryKeys` (solo nomi dei campi, mai i
valori `piva`/`denominazione`). Stessa diagnostica sul gemello SPID
`fetchPartitaIvaFromFiscali` (`ade:fiscali_piva_missing`).

**Fix (rimandato, serve evidenza — regole 13/14).** Alla prossima occorrenza,
leggere `ade:wizard_piva_missing` nel dataset Sentry `logs` per confermare la
shape. Se conferma lista vuota su `200` (transient post-password-change): trattare
`PIva` vuota come transient (retry singolo di Phase F e/o downgrade a
`ade_transient` warn, fuori da Sentry). Non implementare prima della conferma.

### audit-ci: advisory `esbuild` dev-only (3 GHSA)

`audit-ci.json` allowlista tre advisory su **esbuild** (JSON puro → non può
portare un commento inline, quindi la motivazione vive qui):

- `GHSA-67mh-4wv8-2f99` — dev server permette a qualsiasi sito di inviare
  richieste e leggerne la risposta (moderate, CVSS 5.3).
- `GHSA-gv7w-rqvm-qjhr` — mancata verifica di integrità del binario nel modulo
  Deno → RCE via `NPM_CONFIG_REGISTRY` (high).
- `GHSA-g7r4-m6w7-qqqr` — lettura file arbitraria col dev server su Windows
  (high).

- **Perché sono accettabili:** `esbuild` **non** è in `dependencies` di
  produzione (è assente da `package.json` deps); entra **solo transitivamente**
  via la toolchain di **sviluppo/migrazioni** — `drizzle-kit`, `tsx`,
  `@esbuild-kit/* → esbuild` (tutti `devDependencies`). Nessuno di questi vettori
  gira in produzione né nella CI build di Next (Next usa la sua toolchain SWC; le
  migration sono handwritten, `drizzle-kit generate` è bloccato — regola 11; il
  dev server esbuild non viene mai avviato, e il modulo Deno non è in uso).
  Superficie d'attacco reale ≈ 0. Le tre advisory condividono lo stesso identico
  profilo: stessa dipendenza, stesso confine dev-only.
- **Revisione:** rimuovere l'allowlist quando la toolchain (`drizzle-kit`/`tsx`/
  `@esbuild-kit/*`) aggiorna `esbuild` a una versione patchata (>0.28.0) senza
  bump major rischioso. Ricontrollare a ogni bump di `drizzle-kit`/`tsx`.

### #8 link pubblici scontrini senza TTL/revoca (UUID come token)

L'accesso pubblico allo scontrino (`src/app/r/[documentId]/page.tsx`,
`src/lib/receipts/fetch-public-receipt.ts`) usa direttamente il document UUID come
token, senza scadenza, revoca o traccia di accesso. Era tracciato come finding P2;
rivalutato e **declassato a rischio accettato**.

- **Perché è accettabile:** l'UUID ha **122 bit** di entropia → enumerazione
  infattibile. La pagina pubblica espone **solo dati del commerciante** (ragione
  sociale, indirizzo, P.IVA, righe, totali, identificativo AdE) — già pubblici su
  qualsiasi scontrino — e **nessuna PII del cliente**: il documento commerciale è
  anonimo (l'unico dato quasi-personale è il codice lotteria, opzionale e del
  cliente stesso). Il link è **by-design** un artefatto da consegnare al cliente,
  non un segreto, ed è `robots: noindex`. Lo scenario "link condiviso per errore"
  è quindi poco probabile e a basso impatto. Il costo del fix (tabella dedicata +
  migration handwritten + nuova route + UI di gestione + una riga DB per ogni
  scontrino condiviso) è sproporzionato per un hobby project a costi fissi ~€0
  con il vincolo "dipendenze minime".
- **Revisione:** riaprire il finding **se** lo scontrino includerà in futuro il
  codice fiscale / dati anagrafici del cliente (cambia la classe di dati esposti),
  **oppure se** emergerà la necessità di un audit degli accessi o di una revoca
  attiva dei link condivisi.
