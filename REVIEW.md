# REVIEW.md — Audit approfondito del codebase

> **Data:** 2026-06-09 · **Versione analizzata:** v1.3.8 (commit `dc03ed5`)
>
> **Metodologia:** audit in parallelo su tre assi (sicurezza · performance/architettura ·
> correttezza funzionale/bad practices), seguito da verifica manuale di ogni finding
> sul codice corrente. Sono stati **scartati i falsi positivi** (es. riuso idempotency
> key con payload diverso — già gestito via `requestHash`, `IDEMPOTENCY_PAYLOAD_MISMATCH`;
> indice UNIQUE sui VOID — già corretto in migration `0012`; `RateLimiter` senza bound —
> ha già cap 50k chiavi + eviction FIFO) e i **duplicati del backlog di `PLAN.md`**
> (elencati in appendice per cross-reference).
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

## P2 — Media priorità

### 3. Middleware: session refresh Supabase eseguito anche sulle route marketing pure

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

### 4. `fetchPublicReceipt` non richiede `adeTransactionId IS NOT NULL` (defense-in-depth sul documento "valido")

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

### 5. Doppio cast `as unknown as Record<string, unknown>` su `adeResponse` (type safety bypassata su dominio fiscale)

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

### 6. Catalogo: refetch completo dopo ogni mutazione, senza optimistic update

- **Categoria:** UX/performance percepita · **Severità:** Medium
- **File:** `src/components/catalogo/catalogo-client.tsx:32-37` (`refreshItems`), call-site alle righe ~207 e ~220; delete handler nello stesso file

**Problema.** Dopo ogni add/edit/delete, `refreshItems()` ricarica **l'intero
catalogo** dal server (`getCatalogItems`) e nel frattempo la lista mostra lo stato
vecchio: l'item appena aggiunto/modificato appare solo al termine del round-trip.
In contrasto con la priorità #1 (optimistic UI) e destinato a peggiorare con
cataloghi Pro grandi (il `LIMIT` mancante è già tracciato in PLAN.md, target
v1.7.0 — questo fix è indipendente e non lo anticipa).

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

## P3 — Bassa priorità

### 7. Catch generico in `authenticateAndAuthorize` maschera gli errori interni come "Non autenticato"

- **Categoria:** error handling/observability · **Severità:** Low
- **File:** `src/server/catalog-actions.ts:32-42`

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
4. Stesso pattern da replicare se `grep -rn "catch {" src/server` rivela catch
   equivalenti in altre action.

---

### 8. Nessun log dei tentativi di accesso cross-tenant sull'API v1

- **Categoria:** osservabilità/sicurezza · **Severità:** Low
- **File:** `src/app/api/v1/receipts/[id]/void/route.ts` e gli altri endpoint v1 che accettano un UUID nel path (`grep -rn "params" src/app/api/v1 --include="route.ts" -l`); servizi: `src/lib/services/void-service.ts` (branch "documento non trovato")

**Problema.** L'enforcement dell'ownership è corretto (il service filtra per
`businessId` della API key e risponde 404 generico — niente IDOR, niente oracle).
Ma un attaccante che enumera UUID altrui con la propria key produce solo 404
silenziosi: nessun segnale nei log per rilevare l'enumerazione in corso.

**Fix (non ambiguo).**

1. Nel branch not-found dei servizi chiamati dagli endpoint v1 con UUID nel path,
   distinguere se possibile "documento inesistente" da "documento esistente ma di
   altro business" richiede una query in più — **non** farla. Loggare invece un
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

### 9. `formatIsoInRome`: offset calcolato con trick "fake UTC", fragile sui bordi DST

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

## Appendice — Finding emersi in audit ma già tracciati in `PLAN.md`

Riportati solo come cross-reference (NON ri-aprire: la fonte è il backlog
"sicurezza / tech debt" di `PLAN.md`):

| Finding riemerso in audit                                                                                                      | Voce PLAN.md (priorità)                          |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| `searchReceipts`/`exportUserData` senza paginazione; `COUNT(*)` per pagina su API v1; `page/limit/kind` clampati invece di 400 | Paginazione cursor-based (P2)                    |
| Link pubblici `/r/[documentId]` validi per sempre                                                                              | TTL/revoca share token (P2)                      |
| `'unsafe-inline'` in `script-src` per JSON-LD                                                                                  | Eliminare unsafe-inline via hash (P2)            |
| Rotazione `ENCRYPTION_KEY`: callers con `new Map([[version, getEncryptionKey()]])` (`server-auth.ts:123-127`)                  | Key rotation zero-downtime (P3)                  |
| `CookieJar` ignora `Max-Age`/`Expires`/delete                                                                                  | CookieJar expiry (P3)                            |
| Login Fisconline completo (~10 round-trip) a ogni emissione/annullo                                                            | Riuso sessione AdE (P2)                          |
| Finestra PENDING senza `adeTransactionId` → recovery può ri-emettere (doppio documento fiscale)                                | Lookup AdE pre-retry via `searchDocuments` (P2)  |
| Email auth fire-and-forget senza segnale di fallimento all'utente                                                              | Segnale fallimento invio email (P3)              |
| Schema Zod SALE duplicato tra route handler e server action                                                                    | Error envelope uniforme + schema condiviso (P3)  |
| `getCatalogItems` senza `LIMIT` (payload RSC multi-MB su cataloghi Pro)                                                        | Paginazione + autocomplete catalogo (P2, v1.7.0) |
| CHECK constraints / length limits assenti a livello DB                                                                         | DB defense-in-depth (P3)                         |
| Stripe: claim webhook "stuck" non recuperato; customer orfani su checkout concorrenti                                          | Voci Stripe recovery/race (P3)                   |
| Flusso SPID senza allowlist host IdP                                                                                           | SPID allowlist (P3, al wiring di `loginSpid`)    |
| Retry/timeout/backoff divergenti tra auth-actions, real-client, email, db-timeout                                              | Centralizzare policy retry/timeout (P3)          |
