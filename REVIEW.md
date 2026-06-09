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

### 1. Arrotondamento monetario incoerente: il totale inviato ad AdE può divergere dal totale stampato su PDF/pagina pubblica

- **Categoria:** correttezza funzionale/fiscale · **Severità:** High
- **File:**
  - `src/lib/services/receipt-service.ts:522-528` (`submitSaleToAde`, importo `payments[0].amount` trasmesso ad AdE)
  - `src/lib/services/receipt-service.ts:58-71` (`resolveLotteryCode`, check minimo €1,00)
  - `src/lib/receipts/document-lines.ts:53-64` (`calcDocTotal`, usato da storico/analytics)
  - `src/lib/receipts/document-lines.ts:89-128` (`computeReceiptTotals`, usato da pagina pubblica `/r/[documentId]` e PDF)

**Problema.** Convivono due strategie di arrotondamento:

| Funzione               | Strategia                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------- |
| `submitSaleToAde`      | somma float di `grossUnitPrice * quantity`, poi un solo `Math.round(...*100)/100` (per-documento) |
| `resolveLotteryCode`   | per-documento (come sopra)                                                                        |
| `calcDocTotal`         | per-documento (come sopra)                                                                        |
| `computeReceiptTotals` | `Math.round(qty * price * 100)` **per riga**, somma in cents interi (per-riga)                    |

Con quantità frazionarie (la colonna `quantity` è `numeric`, può valere es. `1.5`)
le due strategie producono risultati diversi. Esempio concreto: 3 righe con
`quantity=1.5`, `grossUnitPrice=0.33`:

- per-riga: `Math.round(0.495*100)=50` cents × 3 = **150 cents (€1,50)** → mostrato su PDF e pagina pubblica;
- per-documento: `Math.round(1.485*100)=149` → **€1,49** → trasmesso ad AdE come importo pagamento.

Il documento fiscale trasmesso e quello consegnato al cliente differiscono di 1
centesimo. Inoltre, se AdE ricalcola il totale dalle righe (che vengono trasmesse
singolarmente in `mapSaleToAdePayload`), un `payments[0].amount` incoerente può
causare un rifiuto (`esito: false`) difficile da diagnosticare.

**Fix (non ambiguo).**

1. Scegliere **una** strategia canonica e propagarla ovunque. Raccomandata:
   **per-riga in cents** (è ciò che il cliente vede stampato sul documento, ed è
   coerente con come AdE riceve le righe). Implementare in
   `src/lib/receipts/document-lines.ts` un helper esportato, es.
   `calcInputLinesTotalCents(lines: ReadonlyArray<{ grossUnitPrice: number; quantity: number }>): number`,
   che somma `Math.round(line.grossUnitPrice * line.quantity * 100)` per riga
   (stessa formula di `computeReceiptTotals`).
2. Usarlo in `submitSaleToAde` (`totalAmount = calcInputLinesTotalCents(input.lines) / 100`)
   e in `resolveLotteryCode` (`totalCents = calcInputLinesTotalCents(input.lines)`).
3. **Vincolo regola 17 di CLAUDE.md:** la regola oggi indica `calcDocTotal`
   (per-documento) come helper canonico per analytics/KPI (PR #519, #534).
   Cambiare strategia significa toccare anche `calcDocTotal` e aggiornare la regola
   17 — altrimenti il breakdown analytics divergerebbe dai totali documento.
   La decisione va presa **una volta sola** e applicata a tutti e 4 i punti
   nello stesso PR; in caso contrario (si sceglie per-documento), è
   `computeReceiptTotals` a dover cambiare, e va ri-verificato il rendering
   PDF/pagina pubblica dove i `lineTotal` per riga restano arrotondati.
4. **Test (TDD, prima dell'implementazione):** caso 3×(1.5 × €0.33) sopra +
   property-based o tabellare sui bordi `x.xx5`; un test di coerenza end-to-end che
   verifichi `importo AdE === grandTotal computeReceiptTotals === calcDocTotal`
   sulle stesse righe; edge case: riga singola, quantità intere (non deve cambiare
   nulla per i casi comuni), lotteria con totale esattamente €1,00 (commento
   esistente a `receipt-service.ts:59-60` documenta il falso-negativo IEEE-754 da
   preservare).

---

### 2. `getAuthenticatedUser` senza `react cache()` + waterfall di await sequenziali nella dashboard

- **Categoria:** performance (priorità #1 del progetto: performance percepita) · **Severità:** High
- **File:**
  - `src/lib/server-auth.ts` (definizione `getAuthenticatedUser`, non wrappata in `cache()`)
  - `src/app/dashboard/page.tsx:12-31` (waterfall)
  - `src/server/catalog-actions.ts:81-82` (auth+ownership ripetuti dentro `getCatalogItems`)

**Problema.** Nel render RSC di `/dashboard`:

```ts
const status = await getOnboardingStatus(); // auth.getUser() #1 + query
const user = await getAuthenticatedUser(); // auth.getUser() #2
const planInfo = await getPlan(user.id); // query piano
const initialData = await getCatalogItems(status.businessId); // auth.getUser() #3 + ownership + query
```

`supabase.auth.getUser()` è una chiamata di rete verso Supabase Auth: viene eseguita
**3 volte nello stesso render**, più `checkBusinessOwnership` duplicato. Solo
`getOnboardingStatus` (`src/server/onboarding-actions.ts:519`) e le funzioni di
`plans.ts` usano già `cache()` di React; `getAuthenticatedUser` no. In più i 4
`await` sono sequenziali quando `getPlan` e `getCatalogItems` sono indipendenti
tra loro. Costo stimato: 200–400ms extra per render su rete reale.

**Fix (non ambiguo).**

1. In `src/lib/server-auth.ts`, wrappare `getAuthenticatedUser` con `cache()` di
   React (`import { cache } from "react"`), come già fatto per
   `getOnboardingStatus`. `cache()` è no-op fuori dal render RSC, quindi è sicuro
   per i route handler che la chiamano (pattern già documentato nella skill
   `testing-patterns`, voce "react/cache deduplication across RSC and Route
   Handlers"). Attenzione: il bind `Sentry.setUser({ id })` interno (regola 22,
   `server-auth.ts:51`) deve restare valido — con la dedup viene eseguito una sola
   volta per richiesta, che è il comportamento desiderato.
2. In `src/app/dashboard/page.tsx`, dopo i redirect guard, parallelizzare:
   ```ts
   const [planInfo, initialData] = await Promise.all([
     getPlan(user.id),
     getCatalogItems(status.businessId),
   ]);
   ```
   Mantenere l'ordine dei guard: `getOnboardingStatus` → redirect `/onboarding`,
   poi `getAuthenticatedUser` (gratis se cached), poi il `Promise.all`, poi il
   redirect `canUseDashboardCashier`.
3. Audit veloce delle altre page RSC del dashboard (`grep -rn "await get" src/app/dashboard`)
   per applicare lo stesso pattern dove ci sono ≥2 await indipendenti.
4. **Test:** aggiornare i test esistenti di `server-auth` (il mock di `cache` può
   essere un passthrough `vi.fn((fn) => fn)`); test della page che verifica il
   `Promise.all` (ordine dei call non più strettamente sequenziale). Ogni `it()`
   con almeno un `expect()` (S6661).

---

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

### 5. Riuso sessione AdE — eliminare il re-login completo (~10 round-trip) a ogni operazione

- **Categoria:** performance (latenza dominante dell'emissione) · **Severità:** High
- **File:** `src/lib/services/receipt-service.ts:551` + logout nel `finally`; `src/lib/services/void-service.ts:612` + logout; `src/server/onboarding-actions.ts:356,614`; client: `src/lib/ade/real-client.ts`

**Problema.** Ogni emissione/annullo/verifica crea un nuovo client
(`createAdeClient`) e ripete l'intero login Fisconline (fasi A–G, ~10 round-trip
HTTP **sequenziali** verso AdE) + `logout()`. Il login è la latenza dominante
(principio #1, performance percepita): il `submitSale` vero è un singolo POST,
sempre preceduto da ~10 chiamate di auth.

**Fix (design già deciso, non ambiguo).**

1. Cache in-process per-business: `Map<businessId, { client, expiresAt }>`
   (assunzione single-container coerente con CLAUDE.md) che conserva
   `RealAdeClient` (AdeSession + CookieJar) con TTL **sotto** la scadenza
   sessione AdE (10–12 min) e cap LRU.
2. **Lock async per businessId** (catena di Promise) che serializza le emissioni
   concorrenti: due richieste riusano un solo login invece di gareggiare (evita
   anche il doppio login).
3. Il re-auth su 401 già presente in `submitDocument` resta il fallback di
   correttezza se la sessione è scaduta lato AdE.
4. **Sicurezza:** la cache tiene solo i cookie di sessione in memoria (mai
   persistiti); le credenziali decifrate restano transienti per-operazione,
   **fuori** dalla cache long-lived; invalidare la entry su cambio credenziali e
   su `logout`.
5. **Prerequisito:** il CookieJar deve onorare delete/expiry (item 27) — un jar
   long-lived non può accumulare cookie cancellati.
6. Non deve rompere l'idempotenza stale-recovery (item 4). Escludere il path
   verify/onboarding (raro). Aggiungere metrica `loginCount` vs `emitCount` per
   misurare l'hit-rate.
7. **Test:** hit di cache → un solo login per due emit ravvicinate; expiry TTL →
   nuovo login; 401 dentro submit → re-auth e retry; invalidazione su
   `saveAdeCredentials`; LRU cap.

---

### 6. Middleware: session refresh Supabase eseguito anche sulle route marketing pure

- **Categoria:** performance · **Severità:** Medium
- **File:** `src/proxy.ts:171-199` (blocco auth), `src/proxy.ts:236-253` (matcher)

**Problema.** Il matcher esclude static asset, `api/health`, `api/v1`, PWA asset —
ma tutte le pagine marketing (`/`, `/guide/*`, `/prezzi`, `/per/*`, `/strumenti/*`,
`/confronto`, `/help/*`…) passano per `createMiddlewareSupabaseClient` +
`supabase.auth.getUser()`. L'esito viene usato solo per `PROTECTED_PREFIXES`
(`/dashboard`, `/onboarding`) e `AUTH_ONLY_PATHS` (`/login`, `/register`,
`/reset-password`): per ogni altra route il risultato è ignorato. Per i visitatori
con cookie di sessione presenti, `getUser()` può innescare un token refresh
(round-trip verso Supabase) su pagine SSG che non ne hanno bisogno.

**Fix (non ambiguo).**

1. In `proxy()`, calcolare prima `const needsAuth = PROTECTED_PREFIXES.some(p => pathname.startsWith(p)) || AUTH_ONLY_PATHS.some(p => pathname.startsWith(p));`
2. Se `!needsAuth`, ritornare subito `applyNoindexHeader(NextResponse.next(), request)`
   senza creare il client Supabase (il ramo "Supabase non configurato" resta com'è).
3. **Non** restringere il matcher (il branch `hostnameRedirect` e il noindex header
   devono continuare a girare su tutte le route): la condizione va nel corpo.
4. **Edge case da coprire con test** (`src/proxy.test.ts` o equivalente esistente):
   route marketing senza cookie → nessuna chiamata `getUser` (assert su mock);
   `/dashboard` senza sessione → redirect `/login?redirect=...` invariato;
   `/login` con sessione → redirect `/dashboard` invariato; il refresh cookie
   continua a propagarsi sui redirect (righe 213-218, 225-230). Nota: le pagine
   app _non_ protette non esistono oggi (tutto il dashboard è sotto
   `/dashboard`), quindi non si perde il refresh-on-navigation; se in futuro si
   aggiungono route app fuori da `/dashboard`, andranno incluse in `needsAuth`.

---

### 7. `fetchPublicReceipt` non richiede `adeTransactionId IS NOT NULL` (defense-in-depth sul documento "valido")

- **Categoria:** sicurezza/correttezza · **Severità:** Medium
- **File:** `src/lib/receipts/fetch-public-receipt.ts:39-45`; correlato:
  `src/lib/services/receipt-service.ts:601-611`; accessorio:
  `src/app/api/documents/[documentId]/pdf/route.ts:54-59`

**Problema.** La pagina pubblica `/r/[documentId]` serve qualsiasi documento
`kind='SALE' AND status='ACCEPTED'`. La finalize (`receipt-service.ts:606`) salva
però `adeTransactionId: adeResponse.idtrx ?? null`: se AdE rispondesse
`esito: true` senza `idtrx` (o per qualunque drift futuro nel flusso di
finalize/recovery), esisterebbe un documento ACCEPTED **senza identificativo
fiscale** che la pagina pubblica mostrerebbe comunque come scontrino valido.

**Fix (non ambiguo).**

1. Aggiungere `isNotNull(commercialDocuments.adeTransactionId)` (import da
   `drizzle-orm`) all'`and(...)` del WHERE in `fetchPublicReceipt`.
2. Aggiornare il doc-comment della funzione (l'elenco "Returns null when").
3. **Test:** caso ACCEPTED con `adeTransactionId = null` → ritorna `null`
   (oggi ritornerebbe il documento); i casi esistenti restano verdi.
4. Accessorio (decisione consapevole, non automatica): la route PDF autenticata
   (`pdf/route.ts`) non filtra su `status` — l'owner può generare il PDF di un
   documento PENDING/REJECTED. Verificare dove la UI espone il link PDF
   (`grep -rn "documents/.*pdf" src/components src/app/dashboard`): se è
   raggiungibile per documenti non-ACCEPTED, aggiungere lo stesso filtro
   (`status='ACCEPTED'`, 404 altrimenti) per evitare PDF dall'aspetto fiscale per
   documenti mai accettati; se la UI già lo impedisce, documentarlo con un commento
   nella route.

---

### 8. TTL/revoca per i link pubblici degli scontrini

- **Categoria:** sicurezza · **Severità:** Medium · **Target indicativo:** v1.4.0+
- **File:** `src/lib/receipts/fetch-public-receipt.ts` (lookup per document UUID); pagina `src/app/r/[documentId]/page.tsx`

**Problema.** L'accesso pubblico allo scontrino usa direttamente il document UUID
come token. 122 bit di entropia rendono l'enumerazione infattibile, ma **un link
condiviso per errore resta valido per sempre**: nessuna scadenza, nessuna revoca,
nessuna traccia di accesso.

**Fix (non ambiguo).**

1. Introdurre uno **share token separato** dal document id: nuova tabella (migration
   handwritten, workflow skill `db-migrations`) con `token` (random ≥128 bit,
   base64url), `document_id` FK, `expires_at`, `revoked_at`, `last_accessed_at`.
2. La route pubblica diventa `/r/[token]`: lookup sul token, verifica
   `expires_at`/`revoked_at`, touch di `last_accessed_at` (fire-and-forget).
3. UI: rigenerazione/revoca del link dal dettaglio scontrino nello storico.
4. **Retrocompatibilità:** i link UUID già condivisi vanno gestiti con un
   redirect/grace period documentato, oppure backfill di token per i documenti
   esistenti — decidere esplicitamente nel PR (non rompere silenziosamente i QR
   già stampati).
5. **Test:** token scaduto → 404; revocato → 404; valido → render; touch
   `last_accessed_at` non blocca la response.

---

### 9. Doppio cast `as unknown as Record<string, unknown>` su `adeResponse` (type safety bypassata su dominio fiscale)

- **Categoria:** bad practice/type safety · **Severità:** Medium
- **File:** `src/lib/services/receipt-service.ts:587,608` · `src/lib/services/void-service.ts:297,320` · `src/db/schema/commercial-documents.ts:53`

**Problema.** La risposta AdE viene persistita nel JSONB con un doppio cast che
azzera il type-checking: se la shape della response AdE cambia (o un refactor passa
l'oggetto sbagliato), il compilatore non se ne accorge e il dato salvato diverge
silenziosamente da ciò che i consumer futuri si aspettano.

**Fix (non ambiguo).**

1. In `src/db/schema/commercial-documents.ts`, tipizzare la colonna:
   `adeResponse: jsonb("ade_response").$type<AdeSubmitResponse>()` — dove
   `AdeSubmitResponse` è il tipo (o union dei tipi) già usato come return di
   `submitSale`/`submitVoid` nei client AdE (`src/lib/ade/*-client.ts`; individuarlo
   con `grep -n "esito" src/lib/ade/types.ts` o file equivalente). Se sale e void
   hanno tipi diversi, usare la union.
2. Rimuovere i 4 cast: l'assegnazione diventa `adeResponse: adeResponse` e il
   compilatore la verifica.
3. Verificare i punti di **lettura** della colonna (`grep -rn "adeResponse" src --include="*.ts" -l`):
   con `$type` il select è tipato — eventuali consumer che la trattavano come
   `Record<string, unknown>` vanno adeguati.
4. Nessun cambiamento runtime: basta `npm run type-check` + test esistenti verdi.
   Niente migration (il tipo Drizzle `$type` è solo compile-time).

---

### 10. Catalogo: refetch completo dopo ogni mutazione, senza optimistic update

- **Categoria:** UX/performance percepita · **Severità:** Medium
- **File:** `src/components/catalogo/catalogo-client.tsx:32-37` (`refreshItems`), call-site alle righe ~207 e ~220; delete handler nello stesso file

**Problema.** Dopo ogni add/edit/delete, `refreshItems()` ricarica **l'intero
catalogo** dal server (`getCatalogItems`) e nel frattempo la lista mostra lo stato
vecchio: l'item appena aggiunto/modificato appare solo al termine del round-trip.
In contrasto con la priorità #1 (optimistic UI) e destinato a peggiorare con
cataloghi Pro grandi (item 11). I due fix sono indipendenti.

**Fix (non ambiguo).**

1. Le server action `addCatalogItem`/`updateCatalogItem` ritornano (o vanno fatte
   ritornare) l'item persistito in `CatalogActionResult`; usare quel valore per
   aggiornare lo state locale immediatamente: insert in posizione ordinata per
   `description` (l'ordinamento server è `asc(description)`), patch per l'edit,
   remove per il delete (per il delete, rimozione ottimistica **prima** della
   action con rollback su `{ error }`, pattern `useOptimistic`/`useTransition`
   della skill `react-patterns`).
2. Mantenere `refreshItems()` come riconciliazione in background (non bloccante)
   oppure rimuoverlo se i ritorni delle action coprono tutti i campi.
3. **Edge case + test:** delete che fallisce (item ricompare + `deleteError`
   mostrato); add con descrizione che si ordina in mezzo alla lista; doppio click
   rapido su delete (idempotenza UI); limite Starter raggiunto (l'errore del gate
   server non deve lasciare l'item fantasma in lista).

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

### 14. Catch generico in `authenticateAndAuthorize` maschera gli errori interni come "Non autenticato"

- **Categoria:** error handling/observability · **Severità:** Low
- **File:** `src/server/catalog-actions.ts:32-42`; stesso pattern in `src/server/export-actions.ts:80-84`

**Problema.** `try { user = await getAuthenticatedUser(); } catch { return { error: "Non autenticato." }; }` —
un DB timeout o un errore Supabase inatteso dentro `getAuthenticatedUser` viene
presentato all'utente (autenticato!) come "Non autenticato", senza alcun log.
Diagnosi impossibile e messaggio fuorviante.

**Fix (non ambiguo).**

1. Identificare l'errore "atteso" lanciato da `getAuthenticatedUser` quando la
   sessione manca (leggere `src/lib/server-auth.ts`: se non esiste una classe
   dedicata, introdurla, es. `UnauthenticatedError`, e lanciarla lì al posto
   dell'errore generico).
2. Nel catch: `if (err instanceof UnauthenticatedError) return { error: "Non autenticato." };`
   altrimenti `logger.error({ err, businessId }, "authenticateAndAuthorize failed")`
   e `return { error: "Servizio temporaneamente non disponibile. Riprova." }`.
   Sempre `{ error }` (regola 19: degradare, non lanciare), mai throw.
3. **Test:** sessione assente → "Non autenticato."; `getAuthenticatedUser` che
   lancia un errore generico → messaggio 503-like + `logger.error` chiamato.
4. Stesso pattern da replicare dove `grep -rn "catch {" src/server` rivela catch
   equivalenti in altre action (incluso `exportUserData`).

---

### 15. Nessun log dei tentativi di accesso cross-tenant sull'API v1

- **Categoria:** osservabilità/sicurezza · **Severità:** Low
- **File:** `src/app/api/v1/receipts/[id]/void/route.ts` e gli altri endpoint v1 che accettano un UUID nel path (`grep -rn "params" src/app/api/v1 --include="route.ts" -l`); servizi: `src/lib/services/void-service.ts` (branch "documento non trovato")

**Problema.** L'enforcement dell'ownership è corretto (il service filtra per
`businessId` della API key e risponde 404 generico — niente IDOR, niente oracle).
Ma un attaccante che enumera UUID altrui con la propria key produce solo 404
silenziosi: nessun segnale nei log per rilevare l'enumerazione in corso.

**Fix (non ambiguo).**

1. Nel branch not-found dei servizi chiamati dagli endpoint v1 con UUID nel path,
   distinguere "documento inesistente" da "documento esistente ma di altro
   business" richiederebbe una query in più — **non** farla. Loggare invece un
   `logger.warn` unico sul not-found: `{ documentId, businessId, apiKeyId, errorClass: "v1_document_not_found" }`.
   Il rate di questi warn per `apiKeyId` è il segnale di enumerazione (query
   canonica `errorClass:v1_document_not_found` in Sentry Logs, coerente con la
   skill `sentry-hygiene`).
2. `warn`, non `error`: condizione prevedibile dall'input (regola 20), non deve
   aprire issue Sentry.
3. La risposta HTTP resta invariata (404 generico).
4. **Test:** void di UUID inesistente → 404 + warn con i 3 campi; void del proprio
   documento → nessun warn.

---

### 16. `formatIsoInRome`: offset calcolato con trick "fake UTC", fragile sui bordi DST

- **Categoria:** robustezza · **Severità:** Low
- **File:** `src/lib/date-utils.ts:64-75`

**Problema.** L'offset Europe/Rome è derivato ri-parsando il wall-clock come UTC
(`new Date(isoWall + "Z") - date`). Funziona nei casi normali, ma è un antipattern:
nell'ora di transizione DST (ultima domenica di marzo 02:00→03:00, ultima domenica
di ottobre 03:00→02:00) il wall-clock è ambiguo o inesistente e il diff può
produrre un offset sbagliato di un'ora sul timestamp fiscale esportato.

**Fix (non ambiguo).**

1. **Prima i test** (TDD): casi al bordo — `2026-03-29T00:59:59Z` (ancora +01:00),
   `2026-03-29T01:00:00Z` (diventa +02:00), `2026-10-25T00:59:59Z` (+02:00),
   `2026-10-25T01:00:00Z` (+01:00) — assert sull'offset nell'output.
2. Se i test passano già, chiudere il finding aggiungendo solo i test come
   regression guard (il trick resta documentato dal commento esistente).
3. Se falliscono: ricavare l'offset con un secondo formatter
   `new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Rome", timeZoneName: "longOffset" })`
   e parsing della parte `GMT+02:00` da `formatToParts()`, eliminando il re-parse
   fake-UTC. Nessun nuovo package (vincolo "dipendenze minime").

---

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

### 18. Error envelope uniforme API + schema Zod SALE condiviso

- **Categoria:** architettura/manutenibilità · **Severità:** Low
- **File:** schema duplicati: `src/server/receipt-actions.ts:14-43` (`lineSchema`/`submitReceiptSchema`) vs `src/app/api/v1/receipts/route.ts:26-73` (`receiptBodySchema`) — già condividono `refineLotteryCode`; envelope: tutti gli endpoint `src/app/api/**`

**Problema.** Due copie quasi identiche dello schema SALE (la server action
aggiunge solo `id` UI-only e `businessId`): un bump di `max()` in una copia e non
nell'altra fa divergere API e UI silenziosamente. Inoltre le risposte d'errore API
non hanno una shape uniforme (`{error}` vs `{error, code}` vs status diversi per
lo stesso caso).

**Fix (non ambiguo).**

1. Estrarre lo schema linea + base SALE in `src/lib/receipts/receipt-schema.ts`:
   `export const saleLineSchema = ...; export const saleBodySchema = ...`; la
   server action lo estende con `.extend({ id: z.string() })` sulla linea e
   `businessId`; la route API lo usa diretto.
2. Standardizzare l'envelope: `{ code, message, requestId }` su tutti gli endpoint
   `/api/v1/*` (e progressivamente gli altri), con classificazione
   transient/permanent per gli errori delle integrazioni esterne (coerente con
   regola 10). `requestId` = correlazione log (già presente nel logger o da
   generare per-request).
3. Aggiornare `docs/api-spec.md` con l'envelope.
4. **Test:** uno schema, due consumer — un cambiamento al limite si riflette in
   entrambi; snapshot dell'envelope per gli error path principali (400, 401, 404,
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

### 22. DB defense-in-depth: CHECK constraints e length limits

- **Categoria:** integrità dati · **Severità:** Low
- **File:** migration handwritten nuova (workflow skill `db-migrations`); schema: `src/db/schema/commercial-document-lines.ts`, `catalog-items.ts`, `profiles.ts`, `businesses.ts`

**Problema.** La validazione vive solo nello Zod applicativo: un import legacy, uno
script admin o un refactor che bypassa i refine può scrivere quantità negative o
stringhe chilometriche.

**Fix (non ambiguo).**

1. Migration unica (raggruppata) con:
   - `CHECK (quantity >= 0)` e `CHECK (gross_unit_price >= 0)` su `commercial_document_lines`;
   - `CHECK (default_price >= 0)` su `catalog_items`;
   - `CHECK (char_length(col) <= N)` su `profiles.email`,
     `commercial_document_lines.description` (200), `catalog_items.description`
     (200), `businesses.business_name`, `businesses.address`,
     `businesses.street_number` — allineare N ai limiti Zod correnti.
2. Pattern: `ALTER TABLE ... ADD CONSTRAINT ... CHECK ... NOT VALID` +
   `VALIDATE CONSTRAINT` separato se le tabelle sono grandi (evita lock lunghi);
   verificare prima con un SELECT che nessuna riga esistente violi i vincoli.
3. Aggiornare journal + `node scripts/check-migrations.mjs` + idempotenza al
   re-run (regole migrazioni).
4. **Test:** insert violante rifiutato dal DB anche bypassando Zod (test con
   query raw).

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

### 27. `CookieJar` non onora cancellazione/scadenza dei cookie

- **Categoria:** robustezza · **Severità:** Low oggi — **prerequisito dell'item 5** (riuso sessione AdE)
- **File:** `src/lib/ade/cookie-jar.ts:14-33` (`applyResponse`)

**Problema.** Il jar salva solo `name=value` dal primo segmento di `Set-Cookie`,
ignorando `Max-Age`/`Expires` e la semantica di **cancellazione**
(`Set-Cookie: NAME=; Max-Age=0`): memorizza `NAME=""` e continua a inviarlo.
Impatto ~0 con i client effimeri per-operazione attuali, ma un jar long-lived
(riuso sessione) DEVE onorare delete/expiry.

**Fix (non ambiguo).**

1. In `applyResponse`, parsare gli attributi `Max-Age` ed `Expires` di ogni
   `Set-Cookie`; su delete (`Max-Age <= 0`, `Expires` nel passato, o valore
   vuoto) eseguire `cookies.delete(name)` invece di memorizzare.
2. _Da confermare con una cattura HAR che mostri un Set-Cookie di delete nel
   flusso di login/SSO AdE_ (regola 14: cross-reference one-by-one).
3. **Test:** `Max-Age=0` → cookie rimosso; `Expires` passato → rimosso; valore
   vuoto senza attributi → rimosso; cookie normale → memorizzato come oggi;
   attributi `Path`/`Domain` ignorati senza crash.
4. Implementare **insieme o prima** dell'item 5.

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

## Rischi accettati (allowlist)

### audit-ci: `GHSA-67mh-4wv8-2f99` (esbuild dev server)

`audit-ci.json` allowlista `GHSA-67mh-4wv8-2f99` (JSON puro → non può portare un
commento inline, quindi la motivazione vive qui).

- **Cos'è:** advisory **moderate** (CVSS 5.3) su **esbuild** — il suo dev server
  permette a qualsiasi sito di inviare richieste e leggerne la risposta
  (`range <= 0.24.2`).
- **Perché è accettabile:** entra **solo transitivamente** via
  `drizzle-kit → @esbuild-kit/esm-loader → @esbuild-kit/core-utils → esbuild`,
  ed è un toolchain di **sviluppo/migrazioni**. Il dev server di esbuild **non
  gira mai** in produzione né in CI build (Next usa la sua toolchain; le
  migration sono handwritten, `drizzle-kit generate` è bloccato — regola 11).
  Superficie d'attacco reale ≈ 0.
- **Revisione:** rimuovere l'allowlist quando `drizzle-kit` aggiorna la
  dipendenza `@esbuild-kit/*`/`esbuild` a una versione patchata (oggi nessun fix
  upstream senza bump major di drizzle-kit). Ricontrollare a ogni bump di
  `drizzle-kit`.
