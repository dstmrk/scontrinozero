# REVIEW.md — Registro bug noti e tech debt

> **Data ultimo audit:** 2026-06-27 (incrementale) · **Versione analizzata:** v1.3.8 (commit `dc03ed5`)
>
> **Audit incrementale 2026-06-27:** code review mirata sui percorsi critici
> (registrazione/accesso/onboarding · emissione/annullo scontrini · billing/
> Stripe-webhook), con verifica manuale di ogni finding sul codice corrente.
> Nuovi finding: #35 e #38 (P2), #36/#37 (P3). Falsi positivi/duplicati scartati
> (identity guard, vatNumber overwrite, wizardTemplate PIva, referral, key
> rotation, cursor pagination, CSP, SPID; lato billing: race
> subscription.updated↔stripeCustomerId, normalizzazione email su
> `customers.create`, `invoice.paid` che non tocca `planExpiresAt` — by design,
> skill `stripe-webhooks`).
>
> **Data audit precedente:** 2026-06-09 · v1.3.8 (commit `dc03ed5`)
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

- **Categoria:** sicurezza/billing · **Severità:** High — **gate: blocca il lancio dei developer plan (Developer API, ora nice-to-have in PLAN.md)**
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
5. Da implementare **contestualmente al lancio dei developer plan** (Developer
   API, ora nice-to-have in PLAN.md — non prima: nessun utente ha questi piani
   oggi).

---

## P2 — Media priorità

### 11. `getCatalogItems` senza LIMIT + autocomplete server-side

- **Categoria:** performance/scalabilità · **Severità:** Medium · **Target: v1.6.0** (insieme a "Catalogo: modifica prodotto", già in roadmap PLAN.md)
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

### 35. Mark `ERROR` sugli errori AdE _transient_ aggira la stale-recovery (emit + void)

- **Categoria:** correttezza/concorrenza su mutazione fiscale irreversibile · **Severità:** Medium
- **File:** `src/lib/services/receipt-service.ts:687` (emit), `src/lib/services/void-service.ts:803` (void); selezione recovery `src/lib/services/ade-recovery.ts:64`; riconciliazione pre-resubmit `src/lib/services/void-service.ts:640` (`reconcileVoidBeforeResubmit`)

**Problema.** In entrambi gli orchestratori l'outer-catch fa
`if (!isStatementTimeoutError(err)) { …set status "ERROR"… }`: salta il mark
`ERROR` **solo** sul DB statement-timeout, ma lo applica a **ogni altro** errore,
inclusi gli AdE _transient_ (timeout di rete / 5xx / SPID) — proprio il caso in
cui, come dice il commento del codice stesso (`receipt-service.ts:684-686`: «we
don't know whether submitSale succeeded on AdE»), lo stato su AdE è **ignoto**.
Quando AdE ha _forse_ già registrato il documento ma la risposta è andata in
timeout, marcare `ERROR` (invece di lasciare `PENDING`) ha due conseguenze:

1. Il partial unique index (`status IN ('PENDING','VOID_ACCEPTED')`, migration
   `0012`) **non copre `ERROR`** → un retry guidato dall'utente (nuova
   idempotency key) prende il path _fresh-insert_ di `insertOrResolveVoid`
   (`recovery:false`) → **salta** `reconcileVoidBeforeResubmit` e ri-sottomette a
   AdE alla cieca. Sul **void** AdE respinge il secondo annullo di un documento
   già annullato (mitigazione lato AdE → si finisce in `REJECTED`); sull'**emit**
   non esiste un guard equivalente lato AdE → rischio doppia emissione dello
   stesso scontrino.
2. `ade-recovery.ts:64` seleziona `status IN ('PENDING','ERROR')`, quindi la
   stale-recovery _automatica_ riprende anche le righe `ERROR` riusando la stessa
   riga/sessione e riconcilia — ma la riconciliazione pre-resubmit vive **solo**
   nel path PENDING/recovery, non nel fresh-insert dell'utente sopra.

Lo stato `ERROR` diverge così dalla verità AdE invece di lasciare la riga
`PENDING` e delegare la riconciliazione. **Non coperto da test:** il caso
`void-service.test.ts:806` («NON deve marcare ERROR») copre il path
`VOID_SYNC_FAILED` (finalize-_dopo_-submit, già corretto a parte), **non**
l'outer-catch oggetto di questo finding.

**Fix (non ambiguo).**

1. Estendere la guardia in entrambi gli orchestratori a
   `if (!isStatementTimeoutError(err) && !isTransientAdeError(err))`
   (`isTransientAdeError` è già in `src/lib/ade/error-messages.ts`):
   lasciare `PENDING` anche sugli AdE transient, così la stale-recovery
   riconcilia contro AdE prima di qualsiasi re-submit.
2. Marcare `ERROR` **solo** per errori definitivamente _pre-submit_ (decrypt,
   mapping payload, auth AdE permanente): in quei casi AdE non ha ricevuto nulla
   e il retry è sicuro.
3. **Test:** AdE transient sollevato dopo `submitSale`/`submitVoid` → la riga
   resta `PENDING` (mai `ERROR`) in emit **e** in void; statement-timeout →
   invariato (già `PENDING`); errore pre-submit permanente → `ERROR` come oggi.
4. Tenere allineati i due path (stessa guardia in emit e void) e i rispettivi
   commenti, che già descrivono l'intento corretto ma sono sotto-applicati.

---

### 38. Checkout: il gate server-side blocca solo `active` → subscription Stripe duplicate

- **Categoria:** correttezza/billing · **Severità:** Medium (mitigata lato UI, ma il server non deve dipenderne)
- **File:** `src/app/api/stripe/checkout/route.ts:76` (`getOrCreateStripeCustomerId`); sync che sovrascrive la riga `src/app/api/stripe/webhook/route.ts:373` (`syncSubscriptionData`) e ramo "no row found" `:304` (`applySubscriptionUpdate`); card UI `src/app/dashboard/settings/page.tsx:64` (`computeBillingCardState`)

**Problema.** Il gate pre-checkout in `getOrCreateStripeCustomerId` ritorna 409
**solo** se `existingSub?.status === "active"`. Un utente con subscription
`past_due` / `unpaid` (subscription **viva** su Stripe) supera il check: alla riga
83 `existingSub.stripeCustomerId` esiste → riuso del customer → al completamento
dell'hosted checkout Stripe crea una **seconda** subscription sullo stesso
customer. Poi `syncSubscriptionData` sovrascrive l'**unica** riga DB (una per
`userId`, lookup per `stripeCustomerId`) con la nuova sub: la vecchia resta
**viva e non tracciata** su Stripe (i suoi futuri eventi cadono nel ramo
`"no subscription row found — event acknowledged"` di `applySubscriptionUpdate`),
con rischio **doppio addebito** sul path di dunning `past_due`.

**Mitigazione esistente (solo UI).** `computeBillingCardState` instrada i
`past_due` al **portale** Stripe, non al checkout — ma è difesa lato UI:
l'endpoint `/api/stripe/checkout` resta chiamabile direttamente, e gli stati
`unpaid` non sono special-cased nella card (cadono su `trial-expired` → CTA
checkout). Il server non deve dipendere dalla UI per l'integrità del billing.

**Fix (non ambiguo).**

1. Estendere il gate in `getOrCreateStripeCustomerId` a tutti gli stati Stripe
   "vivi/billabili": bloccare (409 + invito al portale) per `active`, `past_due`,
   `unpaid` (valutare `trialing` — oggi non usato, il trial è interno).
2. **Non** bloccare `incomplete`/`incomplete_expired`: sono il pre-attivazione del
   primo pagamento, bloccarli impedirebbe il retry SCA legittimo
   (l'`idempotencyKey` orario su `session:${priceId}` già de-duplica il retry a
   breve termine).
3. Coerenza UI: la card deve mostrare il ramo "gestisci dal portale" anche per
   `unpaid` (oggi solo `past_due`), così CTA UI e gate server combaciano.
4. **Test:** checkout con sub `past_due`/`unpaid` → 409 senza creare sessione
   Stripe; `canceled`/`pending`/nessuna sub → checkout consentito; `incomplete`
   → consentito (retry primo pagamento).

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

### 23. Indice composito `api_keys (business_id, revoked_at)`

- **Categoria:** performance DB · **Severità:** Low · **Target: Developer API Fase B** (ora nice-to-have in PLAN.md)
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

### 28. SPID: allowlist host IdP prima del wiring di `loginSpid`

- **Categoria:** sicurezza · **Severità:** Low oggi (SPID non cablato) — **bloccante al lancio v1.7.0**
- **File:** `src/lib/ade/real-client.ts:55` (`ADE_ALLOWED_HOSTS`, modello da replicare), `:657` (`parseFormAction`), `:769` (`spidPostCredentials`), `:988`, `:1060`

**Problema.** Il flusso documenti valida i redirect con `resolveAdeRedirect` +
`ADE_ALLOWED_HOSTS`, ma il flusso SPID segue e POSTa verso URL derivati dall'HTML
del SP AdE (`parseFormAction`) e dagli header `Location` dell'IdP **senza
allowlist** — e `spidPostCredentials` invia codice fiscale + password SPID a
`loginformUrl`. Se l'HTML del SP o un redirect IdP fosse manomesso/misconfigurato,
le credenziali finirebbero su un host arbitrario (il TLS verso AdE mitiga in
pratica).

**Fix (non ambiguo).**

1. **Insieme** al wiring di `loginSpid` (v1.7.0): allowlist `SPID_ALLOWED_IDP_HOSTS`
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

### 33. Referral bonus — limiti noti dopo lo split trial-vs-Stripe

- **Categoria:** correttezza/billing · **Severità:** Low — scelte di design accettate, non bug
- **File:** `src/lib/plans.ts` (`fetchPlan`), `src/server/onboarding-actions.ts`
  (`finalizeAdeVerification`, ramo reward), `src/server/referral-reward.ts`
  (`extendSubscriptionForReferral`)

**Contesto.** Il bonus referral (+1 mese, member-get-member) ha ora due binari:
`referralBonusDays` estende **solo** il trial (traslando `trialStartedAt` in
avanti in `fetchPlan`); per un referrer con abbonamento Stripe **attivo** il mese
gratis è erogato estendendo `trial_end` su Stripe, e il webhook risincronizza
`plan_expires_at`. `planExpiresAt` non è più traslato a read-time (Stripe = fonte
di verità sui piani a pagamento), così l'app non diverge più dal portale Stripe.

**Limiti noti accettati:**

1. **Carry-over trial→pagato.** Un utente che accumula `referralBonusDays` mentre
   è in trial e poi si abbona **perde** i giorni residui: il bonus non viene
   trasferito sul nuovo abbonamento Stripe (il checkout non imposta `trial_end`).
   Fuori scope per ora — eventuale fix: leggere `referralBonusDays` residui al
   checkout e impostare `trial_end` sulla subscription.
2. **Referrer `unlimited`.** Nessuna subscription Stripe e piano che non scade →
   il reward incrementa `referralBonusDays` ma è un no-op visibile (il bonus
   tocca solo il trial). Accettato: `unlimited` è invite-only/gratis.
3. **Estensione Stripe fallita = riconciliazione manuale.** `rewardedAt` è già
   committato quando si tenta l'estensione Stripe (chiamata esterna, post-commit
   best-effort): se Stripe è giù, il referrer resta senza mese finché non si
   riconcilia a mano. Cercabile via il log `critical: true` "owed free month
   needs manual reconciliation" in `extendSubscriptionForReferral`. Preferito a
   una data app che torni a divergere da Stripe.

### 34. Annullamento dal portale Stripe non mostrato in-app (cancel_at_period_end)

- **Categoria:** correttezza/UX-billing · **Severità:** Low — gap cosmetico, non
  un bug (l'accesso resta corretto fino a scadenza)
- **File:** `src/db/schema/subscriptions.ts`,
  `src/app/api/stripe/webhook/route.ts` (`syncSubscriptionData`),
  `src/app/dashboard/settings/page.tsx` (`computeBillingCardState`)

**Contesto.** Dal portale Stripe l'utente può annullare l'abbonamento a fine
periodo: Stripe imposta `cancel_at_period_end=true` ma lascia `status='active'`
fino alla scadenza, poi emette `customer.subscription.deleted`. Lo schema
`subscriptions` **non** memorizza `cancel_at_period_end` e `syncSubscriptionData`
non lo cattura, quindi durante la finestra di grazia la card billing mostra il
normale "Pro attivo", senza un "in cancellazione, attivo fino al <data>".
Funzionalmente corretto (l'utente mantiene l'accesso fino a fine periodo, poi
viene fatto il downgrade a trial da `handleSubscriptionDeleted`); Stripe gli
mostra già la data nel proprio portale.

**Fix proposto (nice-to-have).** `ADD COLUMN cancel_at_period_end boolean`
(migration handwritten, `ADD COLUMN IF NOT EXISTS`, default `false`) + cattura in
`syncSubscriptionData` dal `customer.subscription.updated` + nuovo ramo in
`computeBillingCardState` ("in cancellazione") che mostra `currentPeriodEnd`.
Accettato come rifinitura, fuori dal diff partner (v1.4.0).

### 36. `verifyAdeCredentials` senza rate limit (asimmetria con `changeAdePassword`)

- **Categoria:** sicurezza/abuso risorse · **Severità:** Low (mitigata dall'ownership gate)
- **File:** `src/server/onboarding-actions.ts:640` (`verifyAdeCredentials`); modello da replicare: `changePasswordLimiter` + gate in `changeAdePassword` nello stesso file; `RateLimiter`/`RATE_LIMIT_WINDOWS` in `src/lib/rate-limit.ts`

**Problema.** `verifyAdeCredentials` esegue `checkBusinessOwnership` (quindi
**non** è un brute-force cross-utente: serve possedere il business) ma poi avvia
un login AdE completo + `getFiscalData` **senza alcun rate limit**.
`changeAdePassword`, nello stesso file e con lo stesso profilo di costo (login
AdE), è invece protetto da un `RateLimiter` (5 richieste / 15 min,
`AUTH_15_MIN`). Un utente autenticato può quindi martellare il login AdE
ripetendo `verifyAdeCredentials`: oltre all'esaurimento di pool DB/risorse, il
rischio concreto è un **lockout o IP-block lato AdE** sull'egress condiviso, che
impatterebbe **tutti** gli utenti (login/emit/void). La severità è contenuta
dall'ownership gate, ma l'asimmetria con `changeAdePassword` è la motivazione
forte: stessa classe di operazione, protezione incoerente.

**Fix (non ambiguo).**

1. Aggiungere un `RateLimiter` per-utente (chiave `verify-ade:${user.id}`, es.
   5/15 min `AUTH_15_MIN`) sul modello di `changePasswordLimiter`, controllato
   **subito dopo** `checkBusinessOwnership` e prima del decrypt/login AdE.
2. Sul superamento: `logger.warn` (input prevedibile, regola 20 — niente Sentry)
   + ritorno `{ error }` con il messaggio rate-limit standard (degradare, non
   lanciare — regola 19).
3. **Test:** sotto soglia → OK; alla soglia → warn + errore senza chiamare AdE;
   reset alla nuova finestra; chiave per-utente (un business non blocca l'altro).

### 37. Allowlist hostname Turnstile non normalizzata (trim/lowercase)

- **Categoria:** correttezza/robustezza config · **Severità:** Low (contingente a misconfig env)
- **File:** `src/server/auth-actions.ts:145` (`getAcceptedTurnstileHostnames`); pattern di riferimento già normalizzato: `src/lib/partners/partner-host.ts:16` (`getAppHostname`)

**Problema.** Cloudflare Turnstile `siteverify` ritorna `data.hostname` sempre in
**lowercase**. `getAcceptedTurnstileHostnames` costruisce il `Set` di confronto
direttamente dagli env (`APP_HOSTNAME` / `NEXT_PUBLIC_APP_HOSTNAME` /
`NEXT_PUBLIC_MARKETING_HOSTNAME`) **senza** `.trim().toLowerCase()`, mentre
`getAppHostname()` in `partner-host.ts:16` normalizza già. Se uno di questi env
fosse configurato con maiuscole o spazi (es. `"App.ScontrinoZero.IT"` o
`"scontrinozero.it "`), il confronto `Set.has(data.hostname)` (match esatto)
fallirebbe → **ogni** login/register/reset (tutti dietro Turnstile) verrebbe
bloccato con `captcha_hostname_mismatch`. È contingente a una misconfig dell'env
d'identità, ma coerente con la postura fail-fast/normalizzazione delle regole
18/24 (present-but-empty, validazione env): un valore "quasi giusto" non deve
rompere l'auth.

**Fix (non ambiguo).**

1. Normalizzare (`.trim().toLowerCase()`) i due hostname dentro
   `getAcceptedTurnstileHostnames` prima di costruire il `Set` (incluso il
   `www.${marketingHostname}`), riusando il pattern di `getAppHostname`.
2. **Test:** env con maiuscole/spazi → l'hostname lowercase di Turnstile è
   accettato; env già lowercase → comportamento invariato.

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
