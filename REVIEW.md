# REVIEW.md — Registro bug noti e tech debt

> **Ultimo audit:** 2026-08-02 (full-codebase, `main` @ b834286 — passate
> sicurezza / performance / funzionalità / architettura / bad practice)

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

### 84. PWA: verifica manuale su sandbox del service worker ripristinato

- **Categoria:** verifica di rollout · **Severità:** Low — il codice è spedito, resta da confermare sul campo
- **File:** nessuno da modificare. Riferimenti: `serwist.config.mjs`, `src/sw.ts`, `src/components/providers.tsx`, `scripts/check-service-worker.mjs`

**Contesto.** `withSerwistInit` era un plugin **webpack** e Next 16 builda con
**Turbopack**: non girava, degradava a warning e il build restava verde senza
emettere nulla. `GET /sw.js` era **404** in produzione (verificato il
2026-08-03) — niente offline, niente precache e, poiché Chrome emette
`beforeinstallprompt` solo con un SW registrato, **nessuna installazione su
Android**, cioè proprio il bug che `src/lib/pwa/install-prompt-store.ts` era
stato scritto per risolvere. iOS non era colpito, il che rendeva l'asimmetria
fuorviante.

Risolto passando alla configurator mode (build bundler-agnostica + guardia che
fa fallire il build se il bundle manca) e dichiarando la registrazione con
`SerwistProvider`. Dettagli e trappole → skill `pwa-serwist`.

**Resta da fare: verifica manuale su sandbox prima di prod.** Non è
automatizzabile — richiede un browser reale e un dispositivo Android.

1. DevTools → Application → Service Workers: il SW risulta **activated** e
   `/sw.js` risponde 200 (è anche la quarta probe di smoke, skill
   `deploy-release`).
2. DevTools → Application → Cache Storage: dopo aver scaricato un PDF
   autenticato **nessuna** voce `/api/documents/.../pdf` compare in cache; poi
   forzare "Offline" e verificare che la stessa GET **fallisca** invece di
   restituire il documento. È il punto 6 dell'ex #73, finora non eseguibile
   perché non esisteva alcun SW.
3. Chrome su Android: il pulsante "Installa" compare davvero (è la conferma
   end-to-end che chiude il giro con `install-prompt-store.ts`).
4. Navigazione offline → viene servita `/offline`, non l'errore di rete del
   browser.

Chiudere questa voce quando i quattro punti sono verdi su sandbox.

---

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

### 75. Analytics: `ANALYTICS_MAX_DOCS` tronca il dataset **in silenzio** → KPI e fatturato sbagliati

- **Categoria:** correttezza/osservabilità · **Severità:** Medium — nessun segnale quando succede, l'utente vede numeri sbagliati come se fossero corretti
- **File:** `src/server/analytics-actions.ts:195` (`ANALYTICS_MAX_DOCS = 50_000`), `:226` (`.limit(ANALYTICS_MAX_DOCS)` in `fetchSaleDocsInRange`); consumer: `computeKpis`/`computeTimeseries`/`computeBreakdown`/`computeProductBreakdown` in `src/server/analytics-helpers.ts`

**Problema.** `fetchSaleDocsInRange` applica `.limit(50_000)` come safety net
contro tenant con volumi anomali, ma **non verifica mai se il limite è stato
raggiunto**. Superata la soglia, la funzione ritorna un dataset **parziale** e
tutti gli aggregati a valle (fatturato totale, scontrino medio, timeseries,
breakdown per metodo di pagamento e per prodotto) vengono calcolati su un
sottoinsieme, restituendo valori **sottostimati** presentati come definitivi.
Non c'è log, non c'è flag nel payload, non c'è avviso in UI.

Il commento nel codice giustifica la soglia ("nessun business Pro reale emette

> 50k scontrini su un range YTD"), ma il fallimento è **silenzioso e nella
> direzione sbagliata**: un business che supera la soglia è esattamente quello che
> guarda le analytics con più attenzione. Nota che il troncamento colpisce anche
> la vista Starter (`getStarterKpis` usa la stessa funzione su finestra 30d).

**Fix (non ambiguo).**

1. In `fetchSaleDocsInRange`, richiedere `ANALYTICS_MAX_DOCS + 1` righe e
   rilevare il troncamento confrontando `rows.length > ANALYTICS_MAX_DOCS`
   (il `+1` distingue "esattamente 50k documenti" da "più di 50k" — senza,
   `rows.length === limit` è ambiguo). Troncare poi a `ANALYTICS_MAX_DOCS` prima
   di ritornare.
2. Propagare il flag: `fetchSaleDocsInRange` ritorna
   `{ docs: DocRow[]; truncated: boolean }`; `buildAnalyticsDataset` e
   `getStarterKpis` lo portano fino a `AnalyticsBundle` / `StarterKpisResult`
   come campo `truncated?: boolean`.
3. Loggare **una volta per richiesta** quando scatta:
   `logger.error({ critical: true, businessId, range, cap: ANALYTICS_MAX_DOCS, sentryFingerprint: ["analytics", "dataset-truncated"] }, "analytics:dataset_truncated")`.
   `error` + fingerprint stabile (regola 23) perché è una condizione che richiede
   un intervento nostro (alzare la soglia o passare ad aggregazione SQL), non un
   errore d'input utente.
4. UI: in `src/components/analytics/analytics-client.tsx` mostrare un `Alert`
   inline quando `truncated === true` — testo esplicito del tipo "Dati parziali:
   il periodo selezionato supera il limite di documenti analizzabili. Restringi
   l'intervallo per numeri completi." **Mai** mostrare KPI parziali senza avviso.
5. Non alzare la soglia in questo PR: il fix è rendere il troncamento
   **osservabile**. La soluzione strutturale (aggregazione `SUM`/`GROUP BY` lato
   SQL invece del fetch di tutte le righe) è un intervento separato, da valutare
   se e quando il log sopra si accende.
6. **Test:**
   - dataset sotto soglia → `truncated` assente/false, nessun log `error`;
   - dataset a `ANALYTICS_MAX_DOCS` esatti → `truncated: false` (il `+1` non ha
     trovato la riga in più);
   - dataset a `ANALYTICS_MAX_DOCS + 1` → `truncated: true`, un solo
     `logger.error` con il fingerprint atteso, e `docs.length === ANALYTICS_MAX_DOCS`;
   - `getStarterKpis` propaga il flag come `getAnalyticsBundle`.

---

### 77. `addCatalogItem`: conta il catalogo caricando tutte le righe, e il limite Starter è soggetto a race

- **Categoria:** performance + correttezza plan-gate · **Severità:** Medium
- **File:** `src/server/catalog-actions.ts:195-201` (`select({ id })` senza `count()` né `LIMIT`), `:203-224` (check limite fuori da qualsiasi lock). Riferimento del pattern corretto: `src/server/api-key-actions.ts:134-153` (`db.transaction` + `SELECT ... FOR UPDATE` + `count()`)

**Problema.** Due difetti nello stesso blocco.

1. **Performance.** Per decidere se applicare `STARTER_CATALOG_LIMIT` (5
   prodotti) la action esegue `SELECT id FROM catalog_items WHERE business_id = $1`
   **senza LIMIT**, e usa solo `existingItems.length`. Su un business Pro con
   catalogo illimitato (lo scenario del finding #11: 5–10k articoli) ogni
   inserimento di un singolo prodotto trasferisce e materializza migliaia di UUID
   per poi contarli in JavaScript — e il piano Pro **non ha nemmeno un limite da
   verificare**, quindi è lavoro interamente sprecato.
2. **Correttezza.** Il check limite è un read-then-write senza lock: due
   `addCatalogItem` concorrenti su un business Starter con 4 prodotti leggono
   entrambe `4 < 5`, passano entrambe il gate e inseriscono → 6 prodotti su un
   piano che ne ammette 5. `createApiKey` risolve esattamente questa race con
   `SELECT ... FOR UPDATE` sulla riga `businesses`; `addCatalogItem` no.

**Fix (non ambiguo).**

1. Recuperare `planInfo` **prima** e, se il piano non ha limite di catalogo,
   **saltare del tutto** la query di conteggio. Il predicato è già centralizzato:
   usare `canAddCatalogItem`/`STARTER_CATALOG_LIMIT` da `src/lib/plans.ts` per
   determinare se il limite si applica al piano corrente (piani senza limite →
   `currentCount` irrilevante, passare `0`).
2. Quando il limite si applica, spostare conteggio + INSERT dentro una
   `db.transaction` con lock, replicando `createApiKey`:

   ```ts
   return db.transaction(async (tx) => {
     await tx
       .select({ id: businesses.id })
       .from(businesses)
       .where(eq(businesses.id, input.businessId))
       .for("update");
     const [{ count: current }] = await tx
       .select({ count: count() })
       .from(catalogItems)
       .where(eq(catalogItems.businessId, input.businessId));
     // ...check canAddCatalogItem(plan, trialStartedAt, Number(current), planExpiresAt)
     // ...insert
   });
   ```

   Usare `count()` di drizzle, **mai** `select({id}).length`.

3. Mantenere invariati i due messaggi d'errore attuali e la loro precedenza
   (trial/piano scaduto → `TRIAL_EXPIRED_MESSAGE`; limite Starter → messaggio
   specifico con `STARTER_CATALOG_LIMIT`): sono già testati e distinguere i due
   casi è comportamento voluto.
4. `getPlan` resta fuori dalla transazione (è cache-ata per-richiesta e non deve
   allungare la finestra del lock).
5. **Test** (`src/server/catalog-actions.test.ts`):
   - piano Pro/unlimited → **nessuna** query di conteggio eseguita (asserire che
     il mock del `select` di conteggio non è stato chiamato) e insert eseguito;
   - piano Starter a 4 item → insert OK; a 5 item → errore col messaggio del
     limite e **nessun** insert;
   - il conteggio usa `count()` e gira dentro `db.transaction` (mock con
     passthrough del callback, vedi skill `testing-patterns`);
   - trial scaduto → `TRIAL_EXPIRED_MESSAGE` ha precedenza sul messaggio limite.

---

### 78. `getPlan()` può lanciare e quasi nessun caller lo gestisce (viola regola 19)

- **Categoria:** architettura/robustezza · **Severità:** Medium — trasforma un profilo orfano o un DB lento in un error boundary a schermo intero + issue Sentry
- **File:** sorgente del throw `src/lib/plans.ts:81-95` (`ProfileNotFoundError`) e timeout DB propagati; caller **non protetti**: `src/server/receipt-actions.ts:72`, `src/server/void-actions.ts:52`, `src/server/catalog-actions.ts:195`, `src/server/billing-actions.ts:42`, `src/server/api-key-actions.ts:57-60`. Caller **corretti** da cui copiare il pattern: `src/server/analytics-actions.ts:106-128` e `assertProPlan` in `src/lib/plans.ts:186-209`

**Problema.** `getPlan` lancia `ProfileNotFoundError` quando l'auth user non ha
un profilo (orfano: signup a metà, compensating delete fallito) o quando
`profiles.plan` ha un valore fuori enum, e lascia propagare un `57014` sotto
contention DB. `analytics-actions` e `assertProPlan` catturano entrambi i casi e
degradano a `{ error }`; **tutti gli altri caller no**.

Conseguenza in produzione: su `emitReceipt` — il core flow fiscale — un profilo
orfano o un timeout DB fa propagare l'eccezione fino all'error boundary di Next.
È esattamente ciò che la regola 19 di CLAUDE.md vieta ("server action di lettura:
degradare, non lanciare... il throw sostituisce il fallback inline con l'error
boundary di Next, rompendo la performance percepita") e produce anche rumore
Sentry su una condizione ambientale nota (regola 20). Lo stesso vale per
`voidReceipt`, `addCatalogItem`, `getProfilePlan` (settings) e
`authorizeApiKeyBusiness`.

**Fix (non ambiguo).**

1. Estrarre in `src/lib/plans.ts` un helper condiviso che incapsula la
   classificazione già scritta due volte:

   ```ts
   export type SafePlanResult =
     { ok: true; info: PlanInfo } | { ok: false; error: string };

   export async function getPlanSafe(
     authUserId: string,
   ): Promise<SafePlanResult>;
   ```

   Mappature (identiche a quelle di `analytics-actions.ts:106-128`, che diventa
   un consumer dell'helper):
   - `ProfileNotFoundError` → `logger.warn({ userId }, "<action>: orphan auth user — profile missing")` + `{ ok: false, error: "Profilo non disponibile. Contatta il supporto." }`;
   - `isStatementTimeoutError(err)` → `{ ok: false, error: "Servizio temporaneamente sovraccarico, riprova tra qualche istante." }`;
   - qualunque altro errore → **rethrow** (resta visibile in Sentry: è un bug vero).

2. Sostituire `await getPlan(user.id)` con `await getPlanSafe(user.id)` +
   early-return dell'error envelope nei cinque call-site elencati sopra.
   Ciascuno ha già un tipo di ritorno con campo `error` (`SubmitReceiptResult`,
   `VoidReceiptResult`, `CatalogActionResult`, `ProfilePlanResult`,
   il risultato di `authorizeApiKeyBusiness`), quindi nessun cambio di firma
   pubblica.
3. In `catalog-actions.ts` il `getPlan` è dentro un `Promise.all`: sostituirlo
   con `getPlanSafe` e controllare `ok` **prima** di usare `planInfo` (attenzione
   a non lasciare il ramo `Promise.all` che rigetta l'intera coppia).
4. Rifattorizzare `analytics-actions.ts` e `assertProPlan` per usare l'helper,
   così esiste **una sola** copia della classificazione (oggi sono due divergenti:
   `assertProPlan` logga con chiave `authUserId`, analytics con `userId`).
   Uniformare su `userId` (è la chiave nella `SAFE_KEYS` di
   `src/lib/logger.ts`, quindi l'unica che arriva a Sentry).
5. **Test:**
   - `getPlanSafe`: profilo assente → `{ ok: false }` + `logger.warn` (mai
     `logger.error`, quindi nessuna capture Sentry); `57014` → `{ ok: false }`
     col messaggio di sovraccarico; errore generico → rilanciato;
   - per ciascuno dei cinque caller: mock di `getPlan` che lancia
     `ProfileNotFoundError` → la action ritorna `{ error }` e **non** lancia
     (`await expect(action(...)).resolves.toMatchObject({ error: expect.any(String) })`).

---

### 79. `api-key-actions`: nessun guard `isValidUuid` al boundary (regola 9) e revoca non idempotente

- **Categoria:** sicurezza/robustezza · **Severità:** Medium-Low
- **File:** `src/server/api-key-actions.ts:54` (`checkBusinessOwnership` senza guard), `:89` (`eq(apiKeys.businessId, businessId)`), `:134-168` (`createApiKey`), `:192-196` (`revokeApiKey`, `eq(apiKeys.id, keyId)` senza guard e senza filtro su `revokedAt`)

**Problema.** `listApiKeys`, `createApiKey` e `revokeApiKey` passano
`businessId`/`keyId` direttamente a `eq()` su colonne `uuid` **senza
`isValidUuid()`**. È l'unico gruppo di server action rimasto scoperto: storico
(`storico-actions.ts:76`), analytics (`analytics-actions.ts:95`), catalogo
(`catalog-actions.ts:132/175/254/295`), profilo (`profile-actions.ts:175`) e
onboarding (`onboarding-actions.ts:401/917/1306`) hanno tutti il guard, e
`emitReceipt`/`voidReceipt` lo ottengono via schema Zod `.uuid()`.

Un client manomesso che invia una stringa non-UUID produce un `22P02` Postgres
("invalid input syntax for type uuid") che propaga come 500 all'error boundary,
apre una issue Sentry su input utente prevedibile (viola regola 20) e regala un
canale di rumore/log-flood a costo zero per l'attaccante — che sono esattamente
le motivazioni per cui la regola 9 esiste.

Secondo difetto, minore, in `revokeApiKey`: la `WHERE` filtra solo su
`(id, profileId)` senza `isNull(apiKeys.revokedAt)`, quindi revocare due volte la
stessa chiave **sposta in avanti** `revoked_at` invece di essere un no-op. La
chiave resta comunque revocata (nessun impatto di sicurezza), ma il timestamp di
audit diventa inaffidabile.

**Fix (non ambiguo).**

1. In `authorizeApiKeyBusiness` (usato da `listApiKeys` e `createApiKey`),
   subito **dopo** l'auth e **prima** di `checkBusinessOwnership`:
   ```ts
   if (!isValidUuid(businessId)) return { error: "Identificativo non valido." };
   ```
   Usare lo stesso messaggio già in uso in `storico-actions.ts` e
   `analytics-actions.ts` (coerenza UX, nessuna stringa nuova).
2. In `revokeApiKey`, stesso guard su `keyId` prima della query sul profilo.
3. Sempre in `revokeApiKey`, aggiungere `isNull(apiKeys.revokedAt)` alla `WHERE`
   della UPDATE. Il branch `if (!updated)` esistente già ritorna "Chiave non
   trovata o non autorizzata.": una seconda revoca cade lì, che è il messaggio
   corretto. **Non** introdurre un errore nuovo.
4. Nessuna modifica ai messaggi d'errore di ownership/piano già presenti.
5. **Test** (`src/server/api-key-actions.test.ts`):
   - `listApiKeys("non-un-uuid")` → `{ error: "Identificativo non valido." }` e
     `checkBusinessOwnership` **non** chiamato (asserire sul mock);
   - idem `createApiKey` e `revokeApiKey`;
   - UUID valido → comportamento invariato (i test esistenti devono restare verdi);
   - revoca di una chiave già revocata → `{ error: ... }` e nessuna seconda
     scrittura di `revokedAt`.

---

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
- **File:** `src/server/storico-actions.ts:39-113` (`searchReceipts`: offset-based + `COUNT(*)` per request); `src/server/export-actions.ts:78+` (`exportUserData`: export senza limiti); `src/app/api/v1/receipts/route.ts` (`COUNT(*)` full-match a ogni richiesta paginata)

**Problema.** Due facce dello stesso debt (la validazione dei parametri di query
`page`/`limit`/`kind` dell'API con **400** — il terzo aspetto originario — è già
stata risolta separatamente):

1. `searchReceipts` e `GET /api/v1/receipts` usano LIMIT/OFFSET + un `COUNT(*)`
   che scansiona l'intero match a **ogni** pagina richiesta: con 100k+ documenti
   per business la latenza è dominata dal count.
2. `exportUserData` carica tutti i documenti senza bound (rischio OOM su tenant
   grandi).

**Fix (non ambiguo).**

1. Cursor-based: `nextCursor` = `(createdAt, id)` dell'ultimo elemento, query
   `WHERE (created_at, id) < ($cursor)` — sfrutta l'indice composito
   `idx_commercial_documents_business_created` esistente.
2. **Breaking change Developer API** da gestire esplicitamente: rendere `total`
   opt-in (`includeTotal=true`) o sostituirlo con `nextCursor`/`limit+1`;
   aggiornare `docs/api-spec.md` e `DEVELOPER.md`.
3. Export: stream/chunking con bound esplicito (es. batch da 1000 con cursore) e
   limite documentato.
4. **Test:** cursore stabile sotto insert concorrenti; pagina vuota; export con
   N > batch size.
5. Da affrontare **quando il volume per-tenant lo richiede** — monitorare p95
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

### 80. `saveAdeCredentials` è l'unica action credenziali AdE senza rate limit

- **Categoria:** sicurezza/abuso · **Severità:** Low
- **File:** `src/server/onboarding-actions.ts:385-465` (`saveAdeCredentials`, nessun limiter); limiter esistenti nello stesso file da riusare come modello: `:95` (`changePasswordLimiter`), `:106` (`verifyAdeLimiter`, usato a `:927`)

**Problema.** `saveAdeCredentials` è autenticata e verifica l'ownership, ma non
ha rate limit — a differenza di `verifyAdeCredentials` e `changeAdePassword`, le
altre due action che toccano le credenziali AdE. Ogni chiamata: cifra 3 campi
AES-256-GCM, esegue un upsert su `ade_credentials`, e soprattutto invalida
**entrambe** le cache di sessione AdE del business
(`adeSessionCache.invalidate` + `adeInteractiveSessionStore.invalidate`, righe
finali della action) e fa `revalidatePath("/dashboard", "layout")`.

L'invalidazione è la parte costosa: la sessione Fisconline vale ~10 round-trip
HTTP verso AdE (è la ragione per cui `session-cache.ts` esiste), e per CIE la
sessione **non è ri-creabile senza azione umana**. Un client in loop — o una
sessione rubata — può quindi tenere un esercente permanentemente senza sessione
AdE cached, degradando o bloccando l'emissione scontrini, oltre a generare write
amplification sulla riga credenziali.

**Fix (non ambiguo).**

1. Aggiungere in cima a `onboarding-actions.ts`, accanto agli altri:
   ```ts
   const saveAdeCredentialsLimiter = new RateLimiter({
     maxRequests: 10,
     windowMs: RATE_LIMIT_WINDOWS.AUTH_15_MIN,
   });
   ```
   10/15min è generoso per un flusso di onboarding con retry legittimi e resta
   ben sotto la soglia di abuso. Chiave per-utente: `save-ade:${user.id}`
   (per-utente, non per-IP: coerente con `verifyAdeLimiter` e con
   `deleteAccountLimiter`, così utenti dietro lo stesso NAT non si bloccano).
2. Posizionare il check **dopo** `getAuthenticatedUser` e **prima** della
   validazione/cifratura (la cifratura è il primo costo CPU della action).
3. Sul superamento: `logger.warn({ userId: user.id, errorClass: "save_ade_rate_limit" }, "saveAdeCredentials rate limit exceeded")`
   e ritornare `{ error: ERROR_MESSAGES.RATE_LIMIT_AUTH_MINUTES }` — stesso
   messaggio delle altre action auth, nessuna stringa nuova.
4. **Test** (`src/server/onboarding-actions.test.ts`): 10 chiamate consecutive
   OK, l'11ª ritorna l'errore di rate limit **senza** toccare il DB né chiamare
   `adeSessionCache.invalidate` (asserire sui mock). Ricordarsi di resettare il
   limiter fra i test (i limiter sono singleton a livello di modulo).

---

### 81. Sweep GDPR: la query candidati aggrega l'intera tabella `commercial_documents` a ogni giro

- **Categoria:** performance DB · **Severità:** Low (cresce col volume globale, non per-tenant)
- **File:** `src/lib/services/inactive-user-prune.ts:116-146` (SELECT candidati con `LEFT JOIN (… GROUP BY b.profile_id)`); cadenza in `src/instrumentation.ts:84` (`INACTIVE_USER_PRUNE_INTERVAL_MS`, 24h)

**Problema.** La SELECT dei candidati calcola l'ultima attività con un
`LEFT JOIN (SELECT b.profile_id, MAX(cd.created_at) FROM businesses b JOIN
commercial_documents cd ON cd.business_id = b.id GROUP BY b.profile_id)`: la
subquery **scansiona e aggrega l'intera tabella scontrini di tutti i tenant**,
anche se poi servono solo i pochi profili inattivi da 11+ mesi. Gira una volta
al giorno (più un run iniziale a 15 min dal boot, e il container dev si
ridéploya a ogni push su `main`).

Aggravanti: la query non è dentro `withStatementTimeout` (a differenza di ogni
altro percorso pesante della codebase), quindi sotto contention può pinnare una
connessione del pool da 10 finché Postgres non decide da solo; e non ha `LIMIT`,
quindi il batch può diventare arbitrariamente grande — con invii email in serie
dentro il loop, che allungano ulteriormente la finestra fra lo snapshot e
l'elaborazione (la ri-lettura pre-purge di `reReadCandidate`, finding #40, è già
la mitigazione di questo, ma non del costo).

Oggi l'impatto è trascurabile (volumi bassi); diventa rilevante quando
`commercial_documents` supera qualche centinaio di migliaia di righe.

**Fix (quando servirà).**

1. Wrappare la SELECT candidati in `withStatementTimeout` (budget generoso, es.
   30s: è un job di background, non un hot path) e, sul `57014`, loggare `warn` e
   uscire ritornando `{ warned: 0, deleted: 0, reset: 0 }` — lo sweep del giorno
   dopo riprova. Il `try/catch` che ritorna i contatori a zero **esiste già**:
   basta aggiungere il timeout.
2. Sostituire l'aggregato full-table con una subquery correlata `LATERAL` (o una
   scalare) valutata **solo** sui profili che hanno già superato il filtro
   temporale sui campi cheap (`created_at`, `last_sign_in_at`, `last_seen_at`) —
   esattamente la forma già usata in `reReadCandidate:272-277`, il cui commento
   spiega perché è più economica su un singolo profilo. In pratica: filtrare
   prima sui tre timestamp locali, poi verificare `MAX(cd.created_at)` solo sui
   sopravvissuti.
3. Aggiungere `LIMIT` al batch (es. 500 candidati/sweep) con ordinamento
   deterministico: lo sweep è giornaliero e la soglia è in mesi, quindi
   processare a scaglioni non ritarda nulla di percepibile.
4. Valutare un indice su `commercial_documents (business_id, created_at DESC)` —
   `idx_commercial_documents_business_created` esiste già ed è sufficiente per la
   forma correlata del punto 2; **nessuna migration nuova** se si adotta quella.
5. **Test:** la query candidati è wrappata in `withStatementTimeout` (mock); su
   `57014` ritorna i contatori a zero senza lanciare; con più candidati del
   `LIMIT` ne processa esattamente `LIMIT` e i restanti al giro successivo.
   _Trigger:_ p95 del sweep sopra qualche secondo, o `commercial_documents` oltre
   ~500k righe.

---

### 82. `stripe_webhook_events` cresce senza retention e lo sweep gira senza indice

- **Categoria:** manutenzione DB · **Severità:** Low
- **File:** `src/db/schema/stripe-webhook-events.ts` (PK su `event_id`, nessun altro indice); sweep `src/instrumentation.ts:46-75` (`DELETE ... WHERE completed_at IS NULL AND processed_at < threshold`, ogni 10 min); scrittura `src/app/api/stripe/webhook/route.ts:95-99`

**Problema.** La tabella di dedup accumula **una riga per ogni evento Stripe
ricevuto, per sempre**: lo sweep cancella solo i claim _stuck_
(`completed_at IS NULL`), mai le righe completate — che sono la quasi totalità.
È corretto come dedup (una riga rimossa riaprirebbe la porta al riprocessamento
di un evento vecchio), ma non ha alcuna politica di retention: Stripe non
ritenta un evento oltre ~3 giorni, quindi righe più vecchie di qualche settimana
non deduplicano più nulla e restano solo come peso.

Secondo aspetto: lo sweep filtra su `completed_at`/`processed_at`, colonne senza
indice — è un seq scan ogni 10 minuti su una tabella che cresce monotonicamente.

**Fix (quando servirà).**

1. Migration handwritten (regola 11 + skill `db-migrations`) con indice parziale
   dedicato allo sweep:
   ```sql
   CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_stuck
     ON stripe_webhook_events (processed_at)
     WHERE completed_at IS NULL;
   ```
   Indice parziale, non completo: le righe `completed_at IS NULL` sono una
   manciata, l'indice resta minuscolo e copre esattamente la `WHERE` dello sweep.
2. Aggiungere al medesimo interval di `startStripeWebhookClaimSweep` una seconda
   DELETE di retention, con finestra **molto** più larga della finestra di retry
   di Stripe: `DELETE FROM stripe_webhook_events WHERE completed_at IS NOT NULL
AND completed_at < now() - interval '30 days'`. 30 giorni è ~10× il massimo
   ritentativo Stripe: nessun rischio di riprocessare un evento legittimo.
   Serve un secondo indice parziale su `completed_at WHERE completed_at IS NOT NULL`,
   oppure — più semplice — un unico indice su `(completed_at)` che serve entrambe
   le query. Scegliere e motivare nel commento della migration.
3. Loggare il conteggio delle righe eliminate a `info` solo se `> 0` (stesso
   pattern del log esistente dello sweep), per non sporcare i log ogni 10 min.
4. **Test:** riga completata più vecchia di 30 giorni → cancellata; riga
   completata di ieri → intatta; riga con `completed_at IS NULL` → gestita dallo
   sweep dei claim stuck, **non** da quello di retention (i due branch non devono
   sovrapporsi). Aggiornare `src/instrumentation.test.ts` /
   `src/instrumentation-keep-alive.test.ts` secondo la struttura esistente.
   _Trigger:_ tabella oltre ~100k righe, o quando si tocca lo sweep per altro.

---

### 83. `getClientIp`: un `logger.error({critical:true})` **per richiesta** su misconfig Cloudflare

- **Categoria:** osservabilità/costo · **Severità:** Low
- **File:** `src/lib/get-client-ip.ts:34-40`; call-site pubblici che lo attraversano a ogni richiesta: `src/app/api/csp-report/route.ts:30`, `src/app/r/[documentId]/pdf/route.ts:24`, `src/server/auth-actions.ts:84-87`

**Problema.** Quando `CF-Connecting-IP` manca in produzione, `getClientIp` emette
un `logger.error({ critical: true })` — che il `logMethod` hook di
`src/lib/logger.ts` (level ≥ 50) inoltra a `Sentry.captureMessage`. Il segnale è
giusto e voluto (senza, la misconfig si scoprirebbe solo dopo un'ondata di abuso
con tutti i bucket rate-limit collassati su `"unknown"`), ma non è **throttlato**:
in una misconfigurazione reale ogni singola richiesta HTTP genera un evento
Sentry. Sentry raggruppa gli eventi in una sola issue, ma il conteggio pesa sulla
quota del piano free e allaga i Sentry Logs, cioè proprio lo strumento con cui si
diagnosticherebbe l'incidente.

**Fix (non ambiguo).**

1. Throttlare l'allarme a livello di modulo, mantenendo il fail-closed
   (il ritorno `"unknown"` non cambia mai):

   ```ts
   const MISSING_CF_IP_LOG_INTERVAL_MS = 5 * 60 * 1000;
   let lastMissingCfIpLogAt = 0;
   // dentro il branch production:
   const now = Date.now();
   if (now - lastMissingCfIpLogAt >= MISSING_CF_IP_LOG_INTERVAL_MS) {
     lastMissingCfIpLogAt = now;
     logger.error({ critical: true }, "CF-Connecting-IP header missing …");
   }
   ```

   Al più 12 eventi/ora: abbastanza per accorgersene entro pochi minuti, non
   abbastanza per bruciare la quota.

2. Esportare un `resetMissingCfIpThrottleForTests()` (stesso pattern del reset
   del singleton install-prompt, skill `pwa-serwist`) — senza, i test si
   influenzano a vicenda in base all'ordine d'esecuzione.
3. **Non** abbassare il livello a `warn`: la regola 20 riguarda gli errori
   d'input **utente**; questa è una misconfigurazione infrastrutturale nostra e
   deve restare un'issue Sentry.
4. **Test** (`src/lib/get-client-ip.test.ts`): con `NODE_ENV=production`
   (`vi.stubEnv`) e header assente, 100 chiamate consecutive → `logger.error`
   invocato **una** sola volta e 100 valori di ritorno `"unknown"`; avanzando i
   fake timer oltre l'intervallo, la chiamata successiva logga di nuovo; con
   header presente, mai un log.

---

### 62. Stampa termica: i due pacchetti `@point-of-sale/*` hanno tabelle divergenti

- **Categoria:** dipendenze/manutenzione · **Severità:** Low (mitigato, ma fragile)
- **File:** `src/lib/printing/printer-profile.ts`, `src/types/point-of-sale.d.ts`, alias in `next.config.ts` e `vitest.config.ts`

**Problema.** `@point-of-sale/webbluetooth-receipt-printer@2` (ultima release 2024) e `@point-of-sale/receipt-printer-encoder@3` (2025) sono versionati in
modo indipendente e le loro tabelle hanno già divergiato: il trasporto emette
`codepageMapping` `default`/`zjiang` e linguaggio `meow`, che fanno **lanciare**
il costruttore dell'encoder. `default` è il profilo catch-all delle stampantine
economiche, cioè l'hardware target. Oggi è coperto da `resolveCodepageMapping` /
`resolvePrinterLanguage` con test di regressione, ma ogni nuovo profilo aggiunto
a monte può reintrodurre il problema **silenziosamente**, e ce ne accorgeremmo
solo su hardware reale.

Il trasporto porta con sé altri due attriti già aggirati ma non risolti:
`connect()` inghiotte gli errori in un `console.log` (l'esito si deduce
dall'evento `connected`), e il suo `package.json` dichiara la sola condition
`browser` negli `exports`, il che richiede un alias sia in `next.config.ts` (il
pass Client Component SSR risolve con le condition node) sia in
`vitest.config.ts`.

**Fix (quando servirà).** Il trasporto è ~200 righe: se dovessero servire
profili di stampanti non coperti, o se il pacchetto restasse fermo mentre
l'encoder evolve, vendorizzarlo in `src/lib/printing/` è realistico e ci darebbe
errori tipizzati nativamente. L'encoder invece va tenuto: il mapping codepage è
esattamente il pezzo che non ha senso riscrivere. _Trigger:_ una segnalazione di
stampante non riconosciuta, o un altro breaking change fra le due versioni.

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

- **Categoria:** sicurezza · **Severità:** Low oggi (SPID non cablato) — **bloccante quando SPID viene cablato (v2.0, app nativa)**. SPID è fuori da v1.5.0: il flusso IdP in webview richiede persistere il cookie di sessione, non fattibile in PWA (vedi PLAN.md, nota v2.0).
- **File:** `src/lib/ade/real-client.ts:55` (`ADE_ALLOWED_HOSTS`, modello da replicare), `:657` (`parseFormAction`), `:769` (`spidPostCredentials`), `:988`, `:1060`

**Problema.** Il flusso documenti valida i redirect con `resolveAdeRedirect` +
`ADE_ALLOWED_HOSTS`, ma il flusso SPID segue e POSTa verso URL derivati dall'HTML
del SP AdE (`parseFormAction`) e dagli header `Location` dell'IdP **senza
allowlist** — e `spidPostCredentials` invia codice fiscale + password SPID a
`loginformUrl`. Se l'HTML del SP o un redirect IdP fosse manomesso/misconfigurato,
le credenziali finirebbero su un host arbitrario (il TLS verso AdE mitiga in
pratica).

**Fix (non ambiguo).**

1. **Insieme** al wiring di `loginSpid` (v2.0, app nativa): allowlist `SPID_ALLOWED_IDP_HOSTS`
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

## Rischi accettati (documentati, non da fixare)

Scelte consapevoli con un trigger di riapertura. Non sono finding da pianificare.

> ⚠️ **Un rischio accettato su un advisory ha una data di scadenza implicita.**
> Quando il job `audit` inizia a fallire su un advisory documentato qui come
> "senza fix upstream", **ricontrolla range e severity nel registry prima di
> allargare l'allowlist**: gli advisory vengono ri-classificati e ri-rangiati nel
> tempo. È successo con `GHSA-mh99-v99m-4gvg` (brace-expansion): l'entry qui
> affermava che non esisteva backport `1.x`, poi è uscito `1.1.17`, l'advisory è
> passata da `<=5.0.7` a `<1.1.17` e da moderate a **high** (CVSS 7.5) — la
> soluzione era bumpare l'override, non aggiungere path all'allowlist.
> `npm audit --json` mostra `range` e `severity` correnti dell'advisory.

### audit-ci: advisory `esbuild` dev-only

`audit-ci.json` allowlista `GHSA-67mh-4wv8-2f99` (dev-server SSRF).
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
