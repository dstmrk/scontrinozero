# REVIEW.md — Registro bug noti e tech debt

> **Ultimo audit:** 2026-07-11 (full-codebase, `main` @ 8bb9b26)

**Scopo.** Registro canonico dei bug noti, del tech debt e dei miglioramenti di
sicurezza/performance, ordinati per priorità (P1/P2/P3). `PLAN.md` resta la
roadmap delle **funzionalità**. Quando un finding viene risolto, rimuoverlo nel
PR del fix; quando un audit ne trova di nuovi, aggiungerli nella sezione di
priorità corretta.

Ogni finding è autoconsistente: deve poter essere implementato leggendo solo la
sua sezione, nel rispetto delle regole sempre-attive di `CLAUDE.md` (branch
separato, TDD, edge case prima del commit, task > 3 file → sub-task). I trade-off
consapevoli accettati vivono in fondo, in "Rischi accettati".

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

### 63. `deleteAccount` non cancella l'abbonamento Stripe: l'utente cancellato continua a essere addebitato

- **Categoria:** billing/GDPR · **Severità:** High — colpisce **oggi** qualunque abbonato pagante che usa la cancellazione account self-service
- **File:** `src/server/account-actions.ts:97` (`deleteAccount` → `purgeUserById` senza alcun passo Stripe); `src/lib/services/purge-user.ts` (nessuna gestione di `subscriptions` né chiamate Stripe); `src/db/schema/subscriptions.ts:14` + `supabase/migrations/0000_initial.sql:90-104` (`subscriptions.user_id` senza FK verso `auth.users` e fuori dalla cascata `profiles` → la riga sopravvive orfana); effetto collaterale silenzioso: `src/app/api/stripe/webhook/route.ts:438-441` (`syncSubscriptionData` aggiorna `profiles` del user cancellato → 0 righe, nessun log)

**Problema.** `purgeUserById` cancella auth user + profilo (con cascata su
businesses/documenti/catalogo), ma: (a) la **subscription Stripe resta attiva**
— Stripe continua ad addebitare la carta a ogni rinnovo di un utente che non
può più accedere né all'app né al Billing Portal (il portal richiede login);
(b) la riga `subscriptions` resta **orfana** nel DB (nessuna FK, nessuna
cascata), con i webhook che continuano a sincronizzarla; l'UPDATE su
`profiles` dentro `syncSubscriptionData` matcha 0 righe in silenzio, quindi
nessun alert segnala l'anomalia; (c) lato GDPR i dati del customer (email)
restano su Stripe a tempo indeterminato. Lo sweep GDPR
(`inactive-user-prune.ts`) non è esposto perché protegge i paganti, ma il
percorso self-service non ha alcuna guardia — né server-side né nella UI
(`account-delete-section.tsx` non menziona l'abbonamento).

**Fix (non ambiguo).**

1. In `deleteAccount`, dopo la verifica password e **prima** di
   `purgeUserById`: leggere la riga `subscriptions` per `user.id`; se
   `stripeCustomerId` è presente → `stripe.customers.del(stripeCustomerId)`
   in try/catch (regola 10). La delete del customer **cancella immediatamente
   le subscription attive** e rimuove i dati anagrafici da Stripe (chiude
   anche il punto GDPR). Su fallimento Stripe → `return { error: "Non è stato
possibile annullare l'abbonamento. Riprova o gestiscilo dal portale prima
di eliminare l'account." }` **senza** eseguire il purge — fail-safe: meglio
   un account non cancellato che addebiti fantasma non più fermabili.
2. In `purgeUserById` (condiviso col prune): `DELETE FROM subscriptions WHERE
user_id = $authUserId` accanto alla delete del profilo — niente righe orfane
   (per lo sweep prune gli account eleggibili non sono paganti, quindi lì la
   riga è al più `canceled`/`pending`).
3. UI (`account-delete-section.tsx`): menzionare nel dialog che un eventuale
   abbonamento attivo viene annullato immediatamente (regola 8: grep copy).
4. **Test:** account con sub attiva → `customers.del` chiamato prima del purge
   e riga `subscriptions` rimossa; Stripe irraggiungibile → nessun purge +
   errore dedicato; account senza riga subscriptions → flusso invariato;
   sweep prune → riga subscriptions rimossa insieme al profilo.

---

## P2 — Media priorità

### 11. `getCatalogItems` senza LIMIT + autocomplete server-side

- **Categoria:** performance/scalabilità · **Severità:** Medium · **Target: nice-to-have** ("Paginazione lista catalogo (Pro)" in PLAN.md; la "modifica prodotto" è già spedita — bloccante solo se/quando la paginazione viene promossa a release)
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

### 47. Copy marketing/help ancora Fisconline-only: CIE è live ma il sito dice il contrario

- **Categoria:** funzionalità/contenuti (regola 8) · **Severità:** Medium — TODO dichiarato nella PR #695 e rimandato, va tracciato
- **File:** `src/app/(marketing)/help/come-collegare-ade/page.tsx:43-59` ("ScontrinoZero richiede **specificamente Fisconline** per la trasmissione automatica degli scontrini" — ora falso, e "I cittadini senza P.IVA usano SPID/CIE/CNS" presentato come alternativa NON supportata), `:104-113` (procedura solo Fisconline); `src/app/(marketing)/help/sicurezza-credenziali/page.tsx:40,76` (descrive solo CF+password+PIN, non email/password CIE ID); più le altre occorrenze di `grep -rn "Fisconline" src/app/\(marketing\) src/lib/help src/lib/guide src/lib/per src/lib/confronto src/lib/strumenti` (homepage, `funzionalita`, `credenziali-fisconline`, `prima-configurazione`, `primo-scontrino`, `piani-e-prezzi`, `errori-ade`, data file articles/categories/comparisons)

**Problema.** Con CIE live, il copy che presenta Fisconline come **unico**
metodo di collegamento è diventato scorretto: scoraggia proprio il segmento
target della feature (esercenti senza credenziali Fisconline) e contraddice
il prodotto. Nota: la regola 8 vieta promesse di feature non live — qui è
l'inverso, una feature live non raccontata; l'onere di verifica reale su AdE
dichiarato nella PR ("da validare su AdE reale") suggerisce di aggiornare il
copy **dopo** la conferma del primo login CIE reale, ma la decisione va presa
esplicitamente, non lasciata decadere.

**Fix (non ambiguo).**

1. Precondizione: conferma del flusso CIE su AdE reale (`ADE_MODE=real`,
   owner). Fino ad allora questo finding resta il tracker del TODO.
2. Passare in rassegna **ogni** occorrenza del grep sopra e distinguere:
   copy dove Fisconline è "l'unico metodo"/"requisito" → riscrivere come
   "Fisconline **oppure** CIE (app CIE ID)"; copy dove Fisconline è citato
   come uno dei metodi (articolo dedicato `credenziali-fisconline`) → resta,
   aggiungendo il rimando a CIE.
3. Nuovo articolo `/help` dedicato al collegamento con CIE (slug es.
   `collegare-ade-con-cie`), linkato da `come-collegare-ade`; rispettare la
   separazione slug `/help` vs `/guide` (regola 8).
4. Aggiornare FAQ/JSON-LD dove enumerano i requisiti (attenzione agli hash
   CSP se nel frattempo è stato fatto il finding #13).
5. **Test:** quelli esistenti su sitemap/articoli; review umana del contenuto
   (regola 8: contenuti LLM con review umana).

---

### 64. Esito ignoto dopo `submitDocument` (HTTP 200 con body non-JSON) classificato come failure definitiva → mark ERROR → rischio doppio documento fiscale

- **Categoria:** correttezza fiscale/robustezza · **Severità:** Medium — bassa probabilità, danno irreversibile (documento fiscale duplicato su AdE)
- **File:** `src/lib/ade/real-client.ts:1942` (`return response.json()` finale di `submitDocument`, senza guard); gate mark-ERROR: `src/lib/services/receipt-service.ts:798-812` e `src/lib/services/void-service.ts:895-907` (`!isStatementTimeoutError && !isTransientAdeError` ⇒ status ERROR); classificazione: `isTransientAdeError` in `src/lib/ade/error-messages.ts`

**Problema.** Se AdE risponde **200 con body non-JSON** (pagina di manutenzione
HTML servita con 200, risposta troncata, proxy interposto), `response.json()`
lancia un `SyntaxError` nudo: non è `AdeError`, non è transient, non è
statement timeout → emit/void lo trattano come "submit sicuramente non
arrivato" e marcano la riga **ERROR**. Ma la POST è stata consegnata e con un
200 l'esito è **ignoto**: il documento può essere stato registrato. Con la
riga in ERROR: (a) per il **VOID** l'indice unique parziale su
`voided_document_id` esclude ERROR → un retry con key nuova inserisce un
secondo VOID e ri-sottomette → **doppio annullo** su AdE; (b) per il **SALE**
la cassa genera una idempotencyKey nuova a ogni retry → nuovo documento →
**doppia emissione**, senza mai passare dalla riconciliazione
`searchDocuments` che esiste proprio per gli esiti ignoti (REVIEW.md #4, che
copre solo le righe rimaste PENDING). Lo stesso `response.json()` non guardato
esiste su `getFiscalData`/`getDocument`/`getProducts`/`searchDocuments` — lì
l'impatto è solo un errore opaco, non un duplicato.

**Fix (non ambiguo).**

1. In `submitDocument`: try/catch attorno al `response.json()` finale → throw
   di una nuova classe `AdeUnknownOutcomeError` (in `src/lib/ade/errors.ts`),
   messaggio con `statusCode`/`contentType` (mai il body: dati fiscali).
2. Trattarla come **esito ignoto** = lasciare PENDING: farla riconoscere da
   `isTransientAdeError` (documentando che il predicato significa "esito non
   determinabile → non marcare ERROR, warn non Sentry") — così entrambi i
   servizi restano invariati e la stale recovery riconcilia contro AdE via
   `searchDocuments` prima di qualunque re-submit.
3. Mappare la classe in `getUserFacingAdeErrorMessage` sullo stesso messaggio
   "il portale non risponde… riprova" usato per i 5xx.
4. Guard analogo (try/catch → `AdePortalError(status, …)`) sui `response.json()`
   di `getFiscalData`/`getDocument`/`getProducts`/`searchDocuments`: nessuna
   semantica unknown-outcome, basta un errore tipizzato invece del SyntaxError.
5. **Test:** submit 200 + body HTML → riga resta PENDING, log warn (no Sentry);
   retry oltre soglia stale → entra nel path `reconcileSaleBeforeResubmit` /
   `reconcileVoidBeforeResubmit`; 200 + JSON valido → invariato.

---

### 65. Race sul doppio `signUp`: il compensating delete può cancellare l'auth user legittimo → email bloccata per sempre

- **Categoria:** correttezza/auth · **Severità:** Medium — trigger realistico (doppio click/retry di rete sul form), esito permanente senza cleanup manuale
- **File:** `src/server/auth-actions.ts:330-382` (`insertProfileOrRollback`: compensating delete su **ogni** failure dell'insert), `:304-328` (`compensatingDeleteAuthUser`), `:505-529` (pre-check email); schema: `profiles.auth_user_id` **senza FK** verso `auth.users` (`supabase/migrations/0000_initial.sql:5,18`) → nessuna cascata ripulisce il profilo orfano

**Problema.** Due submit ravvicinati della stessa registrazione passano
entrambi il pre-check email (il profilo non esiste ancora). R1:
`auth.signUp` crea l'utente A e committa il profilo. R2: `auth.signUp` sulla
stessa email — per un utente esistente **non confermato** Supabase non crea
un nuovo utente: reinvia la conferma e ritorna **lo stesso id A**. L'insert
profilo di R2 fallisce con unique violation e il catch esegue
`compensatingDeleteAuthUser(A)`: cancella l'auth user della registrazione
legittima di R1. Risultato: profilo orfano (nessuna FK → nessuna cascata),
link di conferma morto, login impossibile, ri-registrazione bloccata dal
pre-check (il profilo esiste) — l'email è inutilizzabile finché non si
interviene a mano. Il commento nel codice assume che il duplicato crei
"un nuovo auth user con UUID diverso", ma per gli unconfirmed non è così.

**Fix (non ambiguo).**

1. In `insertProfileOrRollback`, nel catch e **prima** del compensating
   delete: `SELECT id FROM profiles WHERE auth_user_id = $authUserId`. Se la
   riga esiste, l'auth user appartiene a una registrazione già completata
   dall'altra richiesta → **non** cancellare, procedere col solo
   `redirect("/verify-email")`. (Determinismo: la unique violation viene
   sollevata solo dopo il commit della transazione vincente, quindi la SELECT
   vede sempre la riga.)
2. Difesa aggiuntiva a monte: dopo `auth.signUp`, se `data.user.identities`
   è assente/vuoto (utente obfuscato anti-enumeration di Supabase) trattare
   come email già registrata → redirect `/verify-email` senza insert.
3. **Test:** unique violation con profilo già presente per lo stesso
   authUserId → `deleteUser` mai chiamato; unique violation senza profilo
   (fallimento genuino) → compensating delete invariato; `identities: []` →
   redirect senza insert.

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

**Problema.** Le risposte d'errore API non hanno una shape uniforme (`{error}`
vs `{error, code}` vs status diversi per lo stesso caso). Lo schema Zod SALE
condiviso è già stato estratto in `src/lib/receipts/receipt-schema.ts`: resta
aperta la sola standardizzazione dell'envelope d'errore.

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

- **Categoria:** sicurezza · **Severità:** Low oggi (SPID non cablato) — **bloccante al lancio v1.5.0** (AdE auth multi-metodo)
- **File:** `src/lib/ade/real-client.ts:55` (`ADE_ALLOWED_HOSTS`, modello da replicare), `:657` (`parseFormAction`), `:769` (`spidPostCredentials`), `:988`, `:1060`

**Problema.** Il flusso documenti valida i redirect con `resolveAdeRedirect` +
`ADE_ALLOWED_HOSTS`, ma il flusso SPID segue e POSTa verso URL derivati dall'HTML
del SP AdE (`parseFormAction`) e dagli header `Location` dell'IdP **senza
allowlist** — e `spidPostCredentials` invia codice fiscale + password SPID a
`loginformUrl`. Se l'HTML del SP o un redirect IdP fosse manomesso/misconfigurato,
le credenziali finirebbero su un host arbitrario (il TLS verso AdE mitiga in
pratica).

**Fix (non ambiguo).**

1. **Insieme** al wiring di `loginSpid` (v1.5.0): allowlist `SPID_ALLOWED_IDP_HOSTS`
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

> **Nota.** `FEDERATED_ALLOWED_HOSTS` copre già i redirect (`Location`) del
> flusso federato; dal fix del finding #43 anche le **form action** del flusso
> CIE (`ssoUrl` in `cieFetchSamlRequest`, `formAction` in `ciePostFinalProbe`)
> sono validate via `resolveAdeRedirect(currentPageUrl, action,
FEDERATED_ALLOWED_HOSTS)`. Riusare lo stesso pattern su `parseFormAction`
> qui quando `loginSpid` verrà cablato.

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

### 39. Nessun floor di sicurezza su `INACTIVE_USER_DELETE_AFTER_DAYS`

- **Categoria:** correttezza/GDPR · **Severità:** Low (richiede un typo di config, feature opt-in)
- **File:** `src/lib/services/inactive-user-prune-config.ts` (`readPruneConfig`, `readPositiveInt`); avvio sweep in `src/instrumentation.ts` (`register`)

**Problema.** Un typo nella env (es. `3` al posto di `365`) è accettato senza
obiezioni: con `deleteAfterDays=1` il clamp dell'invariante porta
`warnBeforeDays` a 1 e `warnCutoff` a "adesso" → **tutti** gli utenti non
protetti vengono preavvisati al primo sweep e cancellati dal giorno dopo. Su
una feature distruttiva e irreversibile il costo di un errore di battitura è
sproporzionato. Inoltre il docstring di `readPruneConfig` promette "la
violazione [warn ≥ delete] è segnalata dal chiamante", ma nessun chiamante la
logga: correggere anche questo (segnalarla davvero, o aggiornare il docstring).

**Fix (non ambiguo).**

1. Costante `MIN_DELETE_AFTER_DAYS = 90` in `inactive-user-prune-config.ts`:
   se il valore letto è inferiore, lo sweep **non parte** (`enabled` forzato a
   `false`) — fail-safe: nel dubbio non si cancella nessuno.
2. La config ritorna anche l'elenco delle violazioni (campo `warnings:
string[]`, vuoto se ok) e `register()` in `instrumentation.ts` le logga a
   `logger.warn` al boot — chiude anche il gap del docstring.
3. I test E2E/sandbox che vogliono soglie corte passano la config esplicita a
   `pruneInactiveUsers(now, config)` (già supportato), non via env.
4. **Test:** valore sotto il floor → `enabled=false` + warning; valore valido →
   invariato; `warnBeforeDays ≥ deleteAfterDays` → clamp + warning presente.

---

### 40. Sweep prune: snapshot stantio tra SELECT candidati e delete

- **Categoria:** correttezza · **Severità:** Low (finestra di minuti su soglie di 365 giorni)
- **File:** `src/lib/services/inactive-user-prune.ts` (`pruneInactiveUsers`, `deleteCandidate`)

**Problema.** La SELECT dei candidati è unica a inizio sweep e il loop
processa gli utenti in sequenza con side-effect lenti (email fino a 8s l'una,
retry del purge): con N utenti il batch può durare minuti. Un utente che si
abbona o torna attivo **tra la query e l'elaborazione della sua riga** viene
valutato sullo snapshot vecchio e cancellato comunque. Oggi mitigato dal fatto
che serviva comunque 365gg di inattività + preavviso di 30gg.

**Fix (non ambiguo).**

1. In `deleteCandidate`, subito prima di `purgeUserById`: ri-leggere la
   singola riga (stessa shape della SELECT candidati, filtrata per
   `auth_user_id`) e ri-validare l'eleggibilità (protezione piano, attività <
   `deleteCutoff`, preavviso ≥ `warnGraceCutoff`); se non più eleggibile →
   ritornare `"none"` (o `"reset"` se tornato attivo/protetto).
2. Costo: una query in più **solo** sul ramo delete (raro), zero sul warn.
3. **Test:** riga delete-eligible nello snapshot ma tornata attiva alla
   ri-lettura → nessun purge; ancora eleggibile → purge invariato.

---

### 41. Sweep prune parte solo 24h dopo il boot (starvation su restart frequenti)

- **Categoria:** operatività · **Severità:** Low (prod fa deploy rari; riguarda soprattutto dev)
- **File:** `src/instrumentation.ts` (`startInactiveUserPruneSweep`, `INACTIVE_USER_PRUNE_INTERVAL_MS`)

**Problema.** `setInterval` non esegue mai il callback subito: il primo sweep
avviene 24h dopo il boot. Su un ambiente che riavvia il container più spesso
di una volta al giorno (dev sul Pi ridéploya a ogni push su `main`) lo sweep
**non gira mai**. In prod (deploy tag-based, rari) l'effetto è solo un ritardo
fino a 24h, irrilevante su soglie di mesi.

**Fix (non ambiguo).**

1. Oltre all'interval, un run iniziale ritardato con `setTimeout` unref'd
   (es. 15 minuti dopo il boot, per stare fuori dalla finestra di overlap dei
   container durante `docker compose up -d`).
2. Valutare (non obbligatorio) un jitter di qualche minuto per ridurre la
   probabilità di double-run se due istanze partissero insieme; il double-run
   è comunque innocuo (warn idempotente sul flag, delete già guardata da
   `authDeleted`).
3. **Test:** con fake timers, il callback iniziale scatta dopo il delay e non
   impila un secondo interval; la guardia d'idempotenza resta valida.

---

### 49. API v1: 409 `reauthRequired` senza `code` machine-readable e non documentato

- **Categoria:** architettura/API · **Severità:** Low — Developer API a bassa adozione, ma il contratto è ambiguo
- **File:** `src/app/api/v1/receipts/route.ts:94-106` e `src/app/api/v1/receipts/[id]/void/route.ts:70-82` (response 409 inline, duplicata, senza `code`); `src/lib/api-v1-helpers.ts:160-171` (`SERVICE_ERROR_STATUS_MAP`); `docs/api-spec.md:688` e `DEVELOPER.md` (409 documentato solo come conflitto idempotency)

**Problema.** Il nuovo 409 per sessione CIE scaduta ritorna solo
`{ error: "<messaggio in italiano>" }`, mentre gli altri quattro 409
dell'API (`PENDING_IN_PROGRESS`, `ALREADY_REJECTED`, `VOID_ALREADY_TARGETED`,
`IDEMPOTENCY_PAYLOAD_MISMATCH`) hanno tutti un `code`: un client non può
distinguere "ritenta tra 2s" da "serve un'azione umana sull'app web" senza
parsare il testo italiano. Il body è inoltre duplicato verbatim nelle due
route, e `docs/api-spec.md`/`DEVELOPER.md` non menzionano il nuovo caso.

**Fix (non ambiguo).**

1. Aggiungere `ADE_REAUTH_REQUIRED: { status: 409 }` a
   `SERVICE_ERROR_STATUS_MAP` e sostituire i due blocchi inline con
   `serviceErrorResponse({ error: <messaggio attuale>, code: "ADE_REAUTH_REQUIRED" })`
   (elimina anche la duplicazione).
2. Documentare in `docs/api-spec.md` (sezione errori, accanto al 409
   idempotency) e `DEVELOPER.md`: 409 + `code: ADE_REAUTH_REQUIRED` = la
   sessione AdE interattiva (CIE) va rinnovata dall'app web, il retry
   automatico è inutile finché l'utente non si ricollega.
3. **Test:** envelope `{ code, error }` su entrambe le route quando il
   servizio ritorna `reauthRequired`.

---

### 50. CIE checkpush: rilevamento approvazione "any-change" fragile (falso timeout / falso proceed)

- **Categoria:** correttezza/robustezza · **Severità:** Low — dichiarato "da validare su AdE reale" nella PR #695, va chiuso col primo rollout
- **File:** `src/lib/ade/real-client.ts:1382-1414` (`ciePollAndProceed`: baseline = primo body osservato, approvazione = qualunque body diverso)

**Problema.** Due edge non coperti dal confronto `bodyText !== baseline`:
(a) se l'utente approva la push **prima del primo poll**, la baseline
registrata è già lo stato "approvato" → il body non cambia più → falso
`AdeSpidTimeoutError` nonostante l'approvazione; (b) se il body JSON
contenesse un campo dinamico (timestamp/nonce), il secondo poll differirebbe
sempre dalla baseline → proceed prematuro e fallimento opaco a valle su
`postpush`. L'HAR (20→20→18 byte) suggerisce uno stato JSON stabile, ma la
shape esatta non è verificata a runtime.

**Fix (non ambiguo, in due passi — regole 13/14).**

1. **Evidenza prima del fix:** al primo rollout reale, log structure-only dei
   body checkpush (`bodyLen` + `Object.keys` del JSON parsato, MAI i valori)
   per confermare il campo di stato che distingue attesa/approvazione.
2. Confermata la shape: sostituire il confronto any-change col predicato sul
   campo di stato (es. `parsed.<campo> === <valore atteso>`), che risolve
   entrambi gli edge: l'approvazione pre-primo-poll viene riconosciuta al
   primo giro e un token dinamico non causa proceed prematuro.
3. **Test:** primo body già "approvato" → break immediato; body con campo
   dinamico ma stato invariato → continua il poll; timeout invariato.

---

### 51. Mappa architettura non aggiornata per il flusso CIE (regola 26 violata nel PR #695)

- **Categoria:** documentazione/architettura · **Severità:** Low
- **File:** `docs/architecture/INDEX.md`, `docs/architecture/data-flows.md`, `docs/architecture/config-manifest.md` — zero occorrenze di `interactive-session-store`, `loginCie`, `CIE` (verificato con grep)

**Problema.** La PR #695 introduce un modulo cross-cutting nuovo
(`src/lib/ade/interactive-session-store.ts`), un ramo nuovo nei data flow
emit/void (`reauthRequired`, pre-check `isCieSessionMissing`) e nuove
soglie/limiti (TTL 6h, cap LRU 100 sessioni, finestra push 30×7s,
`FEDERATED_ALLOWED_HOSTS`), ma `docs/architecture/*` non ne parla: la regola
26 richiede l'aggiornamento **nello stesso PR** ("una mappa obsoleta è
peggio di nessuna mappa"). `npm run arch:check` non lo rileva perché valida
solo l'esistenza dei path citati, non la copertura.

**Fix (non ambiguo).**

1. `INDEX.md`: aggiungere `interactive-session-store.ts` ai moduli
   cross-cutting AdE (accanto a `session-cache.ts`, spiegando la differenza
   Fisconline-silenzioso vs CIE-interattivo) e la riga "Dove vive la sessione
   CIE?"; aggiornare l'indice server actions per `saveAdeCredentials`/`verifyAdeCredentials` method-aware.
2. `data-flows.md`: nel flusso emissione/annullo, il ramo CIE (pre-check →
   `reauthRequired` → UI "Ricollegati" / API 409); nel flusso onboarding, la
   verifica CIE (SAML IdP + push + deposito nello store).
3. `config-manifest.md`: `DEFAULT_TTL_MS` (6h), `DEFAULT_MAX_ENTRIES` (100) e
   `FEDERATED_ALLOWED_HOSTS` → puntatori a `interactive-session-store.ts` e
   `real-client.ts` (la finestra polling CIE/SPID è già indicizzata).
4. `npm run arch:check` verde prima di chiudere.

---

### 52. `docs/api-spec.md` sez. 1A: flusso CIE descritto come "impossibile da automatizzare" (obsoleto)

- **Categoria:** documentazione · **Severità:** Low — contraddice l'implementazione live e fuorvia chi la legge
- **File:** `docs/api-spec.md:86-118` (sez. 1A: entry `/dp/SPID/cie/s4`, "pagina con QR code per app CIE ID", "impossibile da automatizzare headlessly") e `:167` (tabella entry point "CIE (via SPID)")

**Problema.** La sezione 1A documenta l'assessment iniziale (HAR
`login_cie.har`, flusso QR) e conclude che CIE non è integrabile; la PR #695
ha invece implementato il flusso reale (HAR `login_cie_ok_notifica_app.har`):
entry `sp.agenziaentrate.gov.it/rp/cie/sel`, login Shibboleth "livello 2"
email+password dell'app CIE ID, conferma via **notifica push** (nessun QR).
Il documento contraddice il codice — chi lo consulta per capire
l'integrazione parte da premesse false.

**Fix (non ambiguo).** Riscrivere la sez. 1A allineandola al flusso
implementato in `real-client.ts` (fasi CIE-1…CIE-8, con i riferimenti alle
entry dell'HAR `login_cie_ok_notifica_app.har` già citate nei docstring) e
aggiornare la riga CIE della tabella `:167` a `/rp/cie/sel`; conservare una
nota storica breve sul flusso QR (esiste come variante "carta fisica" del
livello 1/3, non usata da noi).

---

### 53. `saveAdeCredentials` CIE: validazione server-side più debole del client

- **Categoria:** correttezza/robustezza · **Severità:** Low
- **File:** `src/server/onboarding-actions.ts:331-355` (`buildCieValues`: unico check `username.includes("@")`, nessun bound di lunghezza su username/password); client: `onboarding-form.tsx` (`z.email()`) e `edit-ade-credentials-section.tsx` (`z.email()`)

**Problema.** Il client valida l'email CIE ID con `z.email()`, il server con
un semplice `includes("@")` e nessun limite di lunghezza prima di `encrypt`:
una chiamata diretta alla server action può memorizzare stringhe arbitrarie
(fino al limite di body di Next) come "email" cifrata, e l'errore emergerà
solo al login AdE. Non è un problema di sicurezza (dato cifrato, mai
interpretato), ma il boundary server deve valere da solo (regola 9 come
principio; NB: **non** applicare `normalizeEmail()` — è una credenziale di
un sistema esterno, il case/spazi vanno preservati byte-per-byte come per la
password, e va documentato con un commento).

**Fix (non ambiguo).**

1. In `buildCieValues`: validare l'email con lo stesso criterio del client
   (riusare lo schema Zod `z.email()` server-side) + bound `username.length <= 254`
   e `password.length <= 128` → `{ error }` dedicati.
2. Simmetria: `buildFisconlineValues` ha già bound impliciti (CF 16, PIN
   regex); aggiungere il solo cap password se assente.
3. **Test** (in `onboarding-actions.test.ts`): username senza `@`/malformato/
   oltre 254 char → errore; email valida con maiuscole → salvata NON
   normalizzata (round-trip decrypt identico all'input).

---

### 55. Costruzione `WithAdeSessionParams` duplicata in receipt-service e void-service

- **Categoria:** manutenibilità/duplicazione · **Severità:** Low
- **File:** `src/lib/services/receipt-service.ts:641-652` e `src/lib/services/void-service.ts:740-751` (stesso ternario `prerequisites.method === "cie" ? {...} : {...credentials}` copiato verbatim)

**Problema.** La mappatura `AdePrerequisites` → `WithAdeSessionParams` è
duplicata nei due servizi: al prossimo metodo di login (SPID, Fase 4) o campo
nuovo andrebbe aggiornata in due punti con rischio di drift (stessa classe di
debt del finding #24).

**Fix (non ambiguo).** Estrarre un helper puro
`toAdeSessionParams(businessId: string, prerequisites: AdePrerequisites): WithAdeSessionParams`
(collocazione: `src/lib/server-auth.ts`, accanto al tipo `AdePrerequisites`,
per non far dipendere `lib/ade` dai tipi di server-auth), usarlo in entrambi
i servizi. **Test:** mapping fisconline (con credenziali) e cie (senza),
exhaustiveness sul discriminante `method`.

---

### 60. `changeAdePassword` senza optimistic lock né guard sul metodo: una race con `saveAdeCredentials` può corrompere credenziali CIE

- **Categoria:** correttezza/robustezza · **Severità:** Low — finestra di secondi (durata del flusso HTTP AdE di cambio password), richiede azioni concorrenti dello stesso utente
- **File:** `src/server/onboarding-actions.ts:1265-1268` (UPDATE finale di `encryptedPassword` + `verifiedAt` senza guard su `updatedAt` né su `loginMethod`); pattern corretto già esistente: `finalizeAdeVerification` (`:541-551`, guard `date_trunc('milliseconds', updatedAt) = <snapshot>`)

**Problema.** `changeAdePassword` legge la riga credenziali, esegue il cambio
password su AdE (secondi di HTTP) e poi scrive `encryptedPassword` +
`verifiedAt` con `WHERE businessId` secco. Se nel frattempo l'utente ha
salvato credenziali nuove (`saveAdeCredentials`, es. switch a CIE in un altro
tab: azzera `verifiedAt` e riscrive i campi), l'UPDATE finale sovrascrive la
**password CIE** con la password Fisconline appena cambiata e marca
`verifiedAt` su credenziali mai verificate. `verifyAdeCredentials` ha
l'optimistic lock proprio per questa classe di race (P1.1); qui manca.

**Fix (non ambiguo).**

1. Snapshot `cred.updatedAt` prima del flusso AdE; UPDATE finale con lo
   stesso guard di `finalizeAdeVerification`
   (`date_trunc('milliseconds', updatedAt) = <snapshot ISO>::timestamptz`)
   - `loginMethod = 'fisconline'`.
2. 0 righe aggiornate → `logger.warn` e ritorno `{ error: "Le credenziali
sono state modificate nel frattempo. Verifica la connessione dalle
impostazioni." }` — la password AdE è già cambiata lato portale, quindi il
   messaggio deve spingere alla ri-verifica, non al retry del cambio.
3. **Test:** update concorrente tra login e UPDATE → nessuna scrittura +
   errore dedicato; flusso normale → invariato.

---

### 61. Webhook Stripe senza guardia sull'ordine degli eventi (`event.created`)

- **Categoria:** robustezza/billing · **Severità:** Low — Stripe di norma consegna in ordine, ma non lo garantisce (retry, concorrenza)
- **File:** `src/app/api/stripe/webhook/route.ts:255-259` (`customer.subscription.updated` → `syncSubscriptionData` applica sempre) e `:373-443` (`syncSubscriptionData` sovrascrive status/priceId/cancelAtPeriodEnd/currentPeriodEnd senza confronto temporale); schema: `src/db/schema/subscriptions.ts`

**Problema.** Due `customer.subscription.updated` ravvicinati (es. annulla a
fine periodo → riattiva dal portale) consegnati fuori ordine lasciano nel DB
lo stato **vecchio** (`cancelAtPeriodEnd: true`) finché un evento successivo
non lo corregge — con effetto su copy UI e gate. La dedup per `event.id` non
protegge dall'ordering; i retry di Stripe (fino a 3 giorni) amplificano la
finestra.

**Fix (non ambiguo).**

1. Colonna `last_stripe_event_created` (timestamptz, nullable) su
   `subscriptions` (migration handwritten, skill `db-migrations`).
2. In `syncSubscriptionData` e `handleSubscriptionDeleted`: passare
   `event.created`; l'UPDATE aggiunge
   `WHERE last_stripe_event_created IS NULL OR last_stripe_event_created <= to_timestamp($created)`
   e imposta la colonna. Evento più vecchio → 0 righe → log `warn`
   `stripe_event_out_of_order` e **200** (ack, niente retry).
3. Gli handler `invoice.*` (campi mirati, non full-sync) restano invariati.
4. **Test:** updated con `created` più vecchio del registrato → stato DB
   invariato + warn; sequenza in ordine → invariato; primo evento (colonna
   NULL) → applica.

---

### 66. `getEffectivePlan(userId)` è una server action pubblica senza autenticazione

- **Categoria:** sicurezza/hardening · **Severità:** Low — richiede l'auth UUID della vittima (non enumerabile), leak limitato al nome del piano
- **File:** `src/server/billing-actions.ts:34` (export da modulo `"use server"`); consumer legittimo: `src/server/api-key-actions.ts:54`

**Problema.** Ogni export async di un file `"use server"` diventa un endpoint
POST invocabile da qualunque client con l'action ID (estraibile dal bundle).
`getEffectivePlan` accetta un `userId` arbitrario e risponde senza chiamare
`getAuthenticatedUser`: (a) info-leak del piano di un altro utente dato il suo
auth UUID; (b) due query DB gratuite per invocazione non autenticata (surface
DoS); (c) un `userId` non-UUID produce Postgres 22P02 non gestito → error
boundary + rumore. È un helper server-side, non una action.

**Fix (non ambiguo).** Spostare `getEffectivePlan` fuori dal modulo
`"use server"` — collocazione: `src/lib/plans.ts`, accanto a `getPlan` (già
server-only) — e aggiornare gli import in `api-key-actions.ts` e nei test;
in `billing-actions.ts` restano solo le action autenticate. Verificare con
grep che nessun client component la importi. **Test:** esistenti, spostati;
aggiungere un test che `billing-actions.ts` non esporti più il symbol.

---

### 67. Catalogo: `defaultPrice` validato con `parseFloat` ma inserito come stringa raw → 500 Postgres e valori degeneri

- **Categoria:** correttezza/boundary (regola 9) · **Severità:** Low
- **File:** `src/server/catalog-actions.ts:77-83` (`validateItemInput`), `:191` e `:278` (INSERT/UPDATE con `validated.priceStr` = input originale); colonna `numeric(10,2)` in `supabase/migrations/0000_initial.sql:84`

**Problema.** La validazione fa `Number.parseFloat(priceStr)` e controlla solo
NaN/negativo, poi inserisce la **stringa originale** nella colonna
`numeric(10,2)`. `parseFloat` accetta prefissi numerici e valori speciali:
`"12abc"` passa (parseFloat=12) ma l'INSERT fallisce con 22P02 → eccezione non
gestita → error boundary; `"Infinity"` passa la validazione; `"1e7"` passa
senza alcun tetto. Manca anche il vincolo 2 decimali/max che lo scontrino ha
(`grossUnitPrice` ≤ 999999.99, 2 decimali, `receipt-schema.ts`): il boundary
del catalogo è più lasco di quello della cassa che poi consuma quei prezzi.

**Fix (non ambiguo).**

1. Validare col criterio fiscale di `saleLineSchema`: accettare solo
   `^\d{1,6}([.,]\d{1,2})?$` (virgola normalizzata a punto), range
   0–999999.99; tutto il resto → `{ error: "Prezzo non valido." }`.
2. Inserire la forma **normalizzata** (stringa canonica col punto), mai
   l'input raw.
3. **Test:** `"12abc"`, `"Infinity"`, `"1e7"`, `"-1"`, `"1.999"` → errore;
   `"12,50"` → salvato `"12.50"`; `""`/null → `null` invariato.

---

### 68. Server actions senza guard UUID (regola 9): id malformato → 22P02 Postgres → error boundary

- **Categoria:** robustezza/boundary · **Severità:** Low — solo utenti autenticati, ma rompe la regola 19 e genera rumore
- **File:** `src/server/onboarding-actions.ts:376` (`saveAdeCredentials`), `:881` (`verifyAdeCredentials`), `:1190` (`changeAdePassword`) — businessId; `src/server/profile-actions.ts:171` (`updateBusiness`); `src/server/catalog-actions.ts:98,207,244` (businessId + itemId); `src/server/storico-actions.ts:40` (`searchReceipts`); `src/server/analytics-actions.ts:75` (`authorizeOwner`). Pattern corretto già in repo: `src/server/receipt-actions.ts:32` e `src/server/void-actions.ts:25-29` (Zod `.uuid()`)

**Problema.** `businessId`/`itemId` arrivano dal client e finiscono in `eq()`
su colonne uuid senza `isValidUuid`: un valore non-UUID fa lanciare Postgres
22P02 dentro `checkBusinessOwnership`/le query, che nessuna delle action
elencate gestisce → throw → error boundary di Next (contro la regola 19) al
posto di un errore applicativo inline. `getCatalogItems` lo maschera con un
catch-all che ritorna `[]` ma logga `logger.error` → issue Sentry per input
utente (contro la regola 20).

**Fix (non ambiguo).** `isValidUuid()` (da `@/lib/uuid`) come prima riga dopo
l'auth in ciascuna action elencata → `return { error: "Identificativo non
valido." }` (stessa shape degli altri errori); in `getCatalogItems` degradare
questa classe a `warn`. **Test:** per ogni action, id `"abc"` → `{ error }`
senza che il mock DB venga interrogato.

---

### 69. `getAnalyticsBundle` non degrada su statement timeout (regola 19; incoerente con `getStarterKpis`)

- **Categoria:** robustezza/UX · **Severità:** Low
- **File:** `src/server/analytics-actions.ts:275-294` (`buildAnalyticsDataset`, nessun try/catch attorno a `fetchSaleDocsInRange`/`computeTotalsByDoc`), `:346-364` (`getAnalyticsBundle`); contrasto: `:389-401` (`getStarterKpis` gestisce `isStatementTimeoutError`, PR #572)

**Problema.** Il path Pro passa per `withStatementTimeout(5s)`: sotto
contention il 57014 propaga da `getAnalyticsBundle` fino all'error boundary
della pagina analytics invece del fallback inline — esattamente il
comportamento che la regola 19 vieta e che `getStarterKpis` già corregge.
Inoltre `computeTotalsByDoc` (`fetchLinesByDocIds`) gira **fuori** dal
timeout scoped: la query più pesante del bundle non ha budget.

**Fix (non ambiguo).** try/catch in `buildAnalyticsDataset` attorno a
fetch+compute: su `isStatementTimeoutError` → `{ ok: false, error: "Servizio
temporaneamente sovraccarico, riprova tra qualche istante." }` (stesso
messaggio di `getStarterKpis`); altri errori → rethrow (Sentry). Portare
anche `fetchLinesByDocIds` del path analytics dentro `withStatementTimeout`.
**Test:** timeout su `fetchSaleDocsInRange` → `{ error }` senza throw;
timeout su `fetchLinesByDocIds` → idem; errore generico → throw.

---

### 70. Webhook `invoice.paid`: `currentPeriodEnd` scritto con `invoice.period_end` (semantica Stripe sbagliata)

- **Categoria:** correttezza/billing · **Severità:** Low — oggi il campo non ha consumer runtime, il danno è latente
- **File:** `src/app/api/stripe/webhook/route.ts:242-253`; colonna: `src/db/schema/subscriptions.ts:21` (commento: "data prossimo rinnovo/scadenza")

**Problema.** Per le invoice di rinnovo, `invoice.period_end` è la fine del
periodo di fatturazione appena **chiuso** (≈ l'istante del rinnovo), non la
fine del nuovo periodo pagato — quella vive in
`invoice.lines.data[0].period.end` (o in `items[0].current_period_end` della
subscription, già usato da `syncSubscriptionData`). Poiché `invoice.paid` e
`customer.subscription.updated` arrivano insieme senza ordering garantito
(vedi #61), circa metà delle volte il valore sbagliato sovrascrive quello
corretto e ci resta per un intero ciclo. Il campo oggi non è letto da nessun
consumer runtime (grep: solo webhook/schema; la UI usa
`profiles.plan_expires_at`, il referral legge da Stripe), ma contraddice il
commento dello schema e qualunque feature futura che lo legga nasce rotta.

**Fix (non ambiguo).** Preferito: **rimuovere** l'update di
`currentPeriodEnd` dal case `invoice.paid` (l'evento resta registrato e
gestito, il campo ha `syncSubscriptionData` come unico writer corretto —
una sola fonte, coerente con regola 27b). In alternativa: usare
`invoice.lines.data[0]?.period?.end`, senza update se assente. **Test:**
`invoice.paid` non modifica più `currentPeriodEnd`; `customer.subscription.updated`
resta l'unico writer (assert sul valore da `items[0].current_period_end`).

---

### 71. `changeAdePassword` cifra con la chiave corrente ma etichetta il payload con la `keyVersion` vecchia della riga

- **Categoria:** sicurezza/operatività (rotazione chiavi) · **Severità:** Low — innocuo finché non si ruota `ENCRYPTION_KEY`; complementare al finding #17
- **File:** `src/server/onboarding-actions.ts:1280` (`encrypt(newPassword, key, cred.keyVersion)` con `key = getEncryptionKey()` da `:1242`)

**Problema.** Il byte di versione embeddato nel payload è `cred.keyVersion`
(versione memorizzata sulla riga) mentre la chiave usata è quella corrente. A
cavallo di una rotazione (`ENCRYPTION_KEY_VERSION=2`, righe ancora v1) produce
un payload **etichettato v1 ma cifrato con la chiave v2**: la key-map
multi-versione corretta (fix del finding #17) lo decifrerebbe con la chiave
v1 → authTag mismatch → credenziali illeggibili. Nota strutturale: la colonna
`key_version` è per-riga e copre tutti i campi cifrati, quindi ri-cifrare la
sola password non basta.

**Fix (non ambiguo).** In `changeAdePassword`, nell'UPDATE finale: ri-cifrare
**tutti** i campi cifrati presenti sulla riga (CF — già decifrato nel flusso —,
password nuova, PIN da decifrare allo stesso modo) con `getEncryptionKey()` +
`getKeyVersion()` e aggiornare `key_version` nella stessa UPDATE. **Test:**
con `ENCRYPTION_KEY_VERSION=2` tutti i campi della riga decifrano con la sola
chiave v2 e `key_version=2`; con versione invariata → comportamento identico
a oggi (round-trip decrypt di CF/PIN invariati).

---

### 72. Rate limit cassa 30 scontrini/ora per utente: sotto il volume reale di un esercente e incoerente con l'API (120/h)

- **Categoria:** funzionalità/UX · **Severità:** Low-Medium — blocca il core flow di un utente legittimo nel picco
- **File:** `src/server/receipt-actions.ts:41-44` (`receiptLimiter` 30/h per user); confronto: `src/app/api/v1/receipts/route.ts:30-33` (120/h per API key); da aggiornare insieme: tabella soglie nella skill `testing-patterns` e `docs/architecture/config-manifest.md` (regola 26)

**Problema.** Il prodotto è un registratore di cassa: un bar/food nel picco
pranzo supera facilmente 30 scontrini/ora (uno ogni 2 minuti). Al 31° la cassa
risponde "Troppi scontrini emessi. Riprova tra qualche minuto." per il resto
della finestra — blocco operativo/fiscale per un utente legittimo, mentre lo
stesso account via Developer API può emetterne 120/h. Il limite serve come
anti-loop/anti-abuso (ogni submit costa un round-trip AdE), non come
throttling di business: 30/h è sotto il caso d'uso dichiarato del prodotto.

**Fix (non ambiguo).**

1. Alzare la soglia UI a **120/h** (allineata all'API v1) — ampiamente sopra
   qualunque uso umano della cassa mobile, ancora efficace contro i loop.
   Prima di fissare il valore, verificare nei log di prod il massimo
   scontrini/ora osservato (query pino `Receipt emitted successfully` per
   userId/ora) e documentare la scelta.
2. Aggiornare skill `testing-patterns` (tabella soglie) e
   `docs/architecture/config-manifest.md` nello stesso PR; `npm run arch:check`.
3. **Test:** aggiornare il test del limite emit alla nuova soglia; il
   messaggio d'errore resta invariato.

---

## Rischi accettati (documentati, non da fixare)

Scelte consapevoli con un trigger di riapertura. Non sono finding da pianificare.

### audit-ci: 3 advisory `esbuild` dev-only

`audit-ci.json` allowlista `GHSA-67mh-4wv8-2f99` (dev-server SSRF),
`GHSA-gv7w-rqvm-qjhr` (Deno RCE), `GHSA-g7r4-m6w7-qqqr` (file-read Windows).
`esbuild` non è in `dependencies` prod: entra solo transitivamente via toolchain
dev (`drizzle-kit`/`tsx`/`@esbuild-kit/*`, tutte `devDependencies`), mai a runtime
né nella build Next (SWC). Superficie ≈ 0. **Riaprire:** quando la toolchain
aggiorna `esbuild` > 0.28.0 senza major rischioso → togliere l'allowlist.

### #57 verifica su AdE reale sostituita da sentinella Sentry

Il fix #57 (totali payload per-riga in cents) è spedito, ma l'allineamento
tiene `prezzoUnitario` con la semantica attuale — **non** la variante con
identità moltiplicativa `prezzoLordo = prezzoUnitario × quantità`, che sarebbe
da confermare emettendo su `ADE_MODE=real` uno scontrino a quantità frazionaria
(regole 13/14). Invece di bloccare il rollout su quella verifica manuale, si
accetta la strategia adottata e si delega il rilevamento a due sentinelle in
`runSubmitSale` (`src/lib/services/receipt-service.ts`):

1. **Invariante** — `sum(vendita[].importo) !== ammontareComplessivo` →
   `logger.error` "ade:payload_total_mismatch" (fingerprint
   `["emit-receipt","payload-total-mismatch"]`). Deterministica: non scatta mai
   se l'arrotondamento è corretto → zero rumore, guardia anti-regressione.
2. **Rifiuto AdE su quantità frazionaria** — `esito:false` con almeno una riga a
   `quantity` non intera → `logger.error` "ade:fractional_qty_rejected"
   (fingerprint `["emit-receipt","fractional-qty-rejected"]`, con `adeErrorCodes`
   nei log). I rifiuti su quantità intere restano `warn` (regola 20).

**Riaprire:** se una delle due sentinelle apre una issue Sentry — allora
l'assunzione sui totali va rivista (probabilmente serve la variante
`prezzoUnitario = lineGrossCents/100/quantity`, 8 decimali).

### #8 link pubblici scontrini senza TTL/revoca (UUID come token)

`src/app/r/[documentId]/page.tsx` + `src/lib/receipts/fetch-public-receipt.ts`
usano il document UUID come token, senza scadenza/revoca. UUID = 122 bit
(enumerazione infattibile); la pagina espone solo dati del commerciante (già
pubblici sullo scontrino), nessuna PII del cliente; è by-design un artefatto da
consegnare, `robots: noindex`. Fix (tabella + migration + route + UI) sproporzionato
per un hobby project. **Riaprire:** se lo scontrino includerà dati anagrafici del
cliente, o se servirà audit/revoca degli accessi.

### #33 referral bonus — limiti dopo lo split trial-vs-Stripe

`src/lib/plans.ts` (`fetchPlan`), `src/server/onboarding-actions.ts`
(`finalizeAdeVerification`), `src/server/referral-reward.ts`
(`extendSubscriptionForReferral`). Tre limiti del bonus (+1 mese), rationale in
CLAUDE.md regola 27:

1. **Carry-over trial→pagato:** chi accumula `referralBonusDays` in trial e poi si
   abbona perde i giorni residui (il checkout non imposta `trial_end`).
2. **Referrer `unlimited`:** il reward incrementa `referralBonusDays` ma è un no-op
   (tocca solo il trial). Accettato (`unlimited` è invite-only/gratis).
3. **Estensione Stripe fallita → riconciliazione manuale:** `rewardedAt` è già
   committato; se Stripe è giù il mese va riconciliato a mano (log `critical: true`
   "owed free month needs manual reconciliation"). Preferito a una data app
   divergente da Stripe.

**Riaprire:** se si decide di erogare il carry-over trial→pagato (item 1).
