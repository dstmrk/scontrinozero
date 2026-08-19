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

⚠️ **E non si può fare su dev**, per quanto sia l'ambiente comodo: tutto
`dev.scontrinozero.it` sta dietro Cloudflare Access, e la richiesta con cui
l'installer del service worker scarica `/sw.js` non porta né cookie né header
del service token → Access la redirige e Chromium rifiuta con
`SecurityError: The script resource is behind a redirect, which is disallowed`.
Misurato con un browser reale il 2026-08-19 (dettagli e ricetta nella skill
`playwright-verify`): dalla stessa pagina `fetch('/sw.js')` torna
`type=basic status=200`, quindi il file è servito correttamente — è solo la
richiesta dell'installer a non passare il gate. **Sandbox o prod**, dove Access
non c'è.

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

**Stato al 2026-08-19** — verificato su `sandbox.scontrinozero.it` con un
browser reale, **due volte**: prima su `1.6.2+b09692b`, poi su
`1.7.0+aa99595` dopo il deploy (skill `playwright-verify`). Il secondo giro è
quello che conta, perché dalla 1.7.0 registra `ServiceWorkerRegistrar` e non
più `SerwistProvider`. Profilo browser ripulito prima della misura
(`unregister()` + `caches.delete()`), altrimenti si sarebbe osservato il SW
vecchio. Esiti identici nelle due versioni:

1. ✅ **Verde.** `state: 'activated'`, `navigator.serviceWorker.controller` =
   `https://sandbox.scontrinozero.it/sw.js`, `/sw.js` 200, e Cache Storage
   popolato (`serwist-precache-v2-…`, `others`, `static-font-assets`,
   `cross-origin`, `next-image`, `pages-rsc-prefetch`). La regressione del 404
   è chiusa sul campo.
2. ⚠️ **Parziale.** Verificato che una GET `/api/*` passa dal SW e **non**
   entra in nessuna cache (provato con `/api/health/live`, pubblica): il
   NetworkOnly override è attivo. Il caso specifico `/api/documents/<id>/pdf`
   richiede una sessione autenticata e **non è automatizzabile su sandbox**:
   lì il gate Turnstile è attivo (misurato: lo script di
   `challenges.cloudflare.com` viene caricato e `button[type=submit]` resta
   `disabled` in attesa del token), e il bypass `TURNSTILE_DISABLED` esiste
   solo su dev. Nemmeno Chromium reale risolve una managed challenge.
   L'emissione in sé sarebbe innocua — sandbox ha `ADE_MODE=mock` — ma non ci
   si arriva. Resta una verifica manuale con i DevTools, da fare in sessione
   già autenticata.
3. ⛔ **Non automatizzabile.** Richiede un dispositivo Android reale.
4. ✅ **Verde.** Con `setOffline(true)`, navigando una rotta non in cache la
   navigazione riesce e viene servita `/offline` («Sei offline…»), non
   l'errore di rete del browser.

✅ **Il caveat è chiuso.** Il dubbio era che la combinazione
«`ServiceWorkerRegistrar` + registrazione che riesce e attiva il SW» non fosse
mai stata osservata: su dev la blocca Cloudflare Access, su sandbox girava
ancora il codice precedente. Misurata sulla `1.7.0+aa99595` è verde —
`state: 'activated'`, `controller` valorizzato, i sette bucket di cache
popolati — e con `unhandledRejections: []` e **nessun** warn `[pwa]`, che è il
segno che la registrazione è riuscita (il warn compare solo sul fallimento,
come si osserva su dev).

Chiudere questa voce quando i quattro punti sono verdi su sandbox con la
versione corrente.

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

- **Categoria:** sicurezza/hardening · **Severità:** Medium · **Bloccato:** serve prima spezzare la CSP per route group (vedi "Prerequisito")
- **File:** `src/lib/csp.ts:52` (`script-src`); header unico applicato a `/(.*)` da `src/lib/security-headers.ts:48` + `next.config.ts:97-108`; payload JSON-LD: `softwareApplicationJsonLd`, `organizationJsonLd`, `faqPageJsonLd` e breadcrumb degli help dinamici (grep `application/ld+json` in `src/app/(marketing)` e `src/components`)

**Problema.** `script-src 'self' 'unsafe-inline' challenges.cloudflare.com`
neutralizza gran parte del valore della CSP contro XSS: qualsiasi inline script
iniettato verrebbe eseguito. Oggi è mitigato da `safeJsonLd()` (escaping) e dal
fatto che i payload sono statici, ma è un single point of failure.

**⚠️ Il "Path A — hash" dato per deciso in una revisione precedente NON è
praticabile** finché la CSP è un header unico e statico. Verificato:

1. `buildCsp()` produce **una sola stringa**, applicata a `/(.*)`: nessuna
   variazione per pagina né per richiesta.
2. Gli inline script in pagina non sono solo i nostri JSON-LD. Next App Router
   inietta i propri `<script>self.__next_f.push(...)</script>` con il payload
   RSC (`node_modules/next/dist/server/app-render/use-flight-response.js`), e
   sul gruppo app — dinamico e autenticato — sono **per-richiesta**, quindi non
   hashabili in un header statico. Si aggiunge il no-flash script inline di
   `ThemeProvider` (next-themes, `src/app/dashboard/layout.tsx`).
3. Conseguenza: hashare i ~40 payload JSON-LD e togliere `'unsafe-inline'`
   **romperebbe l'idratazione di tutta l'app**, non solo i dati strutturati —
   e in enforce mode il browser non lo segnala se non nei CSP report.
4. Path B (nonce puro) resta scartato per l'SSG marketing: il nonce vive
   nell'HTML, che per una pagina prerenderizzata è cacheato.

**Prerequisito (da fare prima, task a sé).** Spezzare l'header CSP per route
group:

- gruppo app (dinamico): CSP con **nonce** per-richiesta generata in
  `src/proxy.ts`. Next propaga il nonce ai propri inline script — supportato
  nativamente (`<script nonce="…">` in `use-flight-response.js`);
- gruppo marketing (SSG): CSP separata, dove l'HTML è stabile a build time e
  gli hash dei JSON-LD diventano finalmente sensati.

**Fix (solo dopo il prerequisito, e solo sul gruppo marketing).**

1. Precomputare gli SHA-256 dei payload JSON-LD inline (build-time o test che
   genera/verifica gli hash) e includerli come `'sha256-XXX'` al posto di
   `'unsafe-inline'`.
2. Fragilità nota: ogni edit ai JSON-LD ricalcola gli hash → aggiungere un test
   che fallisce con messaggio esplicito quando un payload cambia senza aggiornare
   l'hash (così il drift si vede in CI, non in produzione con script bloccati).
3. `'unsafe-inline'` su **style-src resta** (Tailwind 4 + Radix UI, fuori scope).
4. Verificare su sandbox prima di prod: uno script bloccato dalla CSP rompe il
   widget Turnstile o i dati strutturati silenziosamente — controllare la console
   e i report CSP.

---

### 93. Sandbox serve `appUrl` di **produzione**: QR e redirect Stripe puntano a prod

- **Categoria:** configurazione di deploy · **Severità:** Medium su sandbox, nessun impatto su produzione · **Pre-esistente** (identico su 1.6.2 e 1.7.0)
- **File:** `.github/workflows/deploy.yml` (step di build, nessun `NEXT_PUBLIC_APP_URL` fra i build-args), `Dockerfile:56`, `.env` del compose sulla VPS sandbox

**Problema.** `GET /api/health/env` su `sandbox.scontrinozero.it` risponde:

```json
{ "appUrl": "https://app.scontrinozero.it",
  "hostnames": { "app": "sandbox.scontrinozero.it", ... } }
```

`APP_HOSTNAME` è impostata correttamente, `NEXT_PUBLIC_APP_URL` no: assente (o
vuota) fa scattare il default prod-aware di `getTrustedAppUrl()`
(`src/lib/trusted-app-url.ts`), che in `NODE_ENV=production` è proprio
`https://app.scontrinozero.it`. È esattamente la discrepanza che il probe `env`
esiste per catturare — la skill `deploy-release` la descrive come «un
Dockerfile build-arg dimenticato».

**Perché succede.** `deploy-dev.yml` passa
`NEXT_PUBLIC_APP_URL=https://app-dev.scontrinozero.it` fra i build-args;
`deploy.yml` — che serve prod **e** sandbox dallo stesso tag — non lo passa, e
il `ARG` del Dockerfile ha come default il valore di produzione. Il valore
runtime nel compose della VPS sandbox non lo sovrascrive.

**Conseguenze.** `getTrustedAppUrl()` alimenta il QR stampato sui PDF
(`generatePdfResponse` → `publicUrl = <appUrl>/r/<id>`) e le
`success_url`/`cancel_url`/`return_url` di Stripe checkout/portal. Su sandbox
quindi: un QR scansionato porta il cliente su **produzione**, dove
quell'`id` non esiste (404) — e un checkout di test rimbalza su prod a fine
flusso. Nessun effetto sull'ambiente di produzione, che riceve il valore
giusto per default; il danno è che sandbox non testa ciò che spedisce.

**Da fare.** Passare `NEXT_PUBLIC_APP_URL` come build-arg anche in
`deploy.yml`, derivandolo dall'ambiente di destinazione invece di ereditare il
default del Dockerfile. Attenzione: è `NEXT_PUBLIC_*`, quindi **bakata al
build** per il bundle client — impostarla solo a runtime nel compose
sistemerebbe `getTrustedAppUrl()` (server-side) ma lascerebbe il client con
l'URL di produzione. Va risolto al build.

---

### 88. Mapper AdE: sei divergenze dal payload del portale (una attiva in produzione)

- **Categoria:** correttezza · **Severità:** Medium — i totali fiscali
  trasmessi sono corretti, ma il documento che l'AdE genera e archivia non è
  quello che genererebbe il portale
- **File:** `src/lib/ade/mapper.ts`, `src/lib/ade/mapper.test.ts`

**Contesto.** Il confronto di `computeLineAmounts` / `mapSaleToAdePayload`
contro tre catture del portale reale (payload verbatim, formule e verifiche
numeriche in `HAR.md`, voci #2, #4, #7, #10, #11, #12) ha trovato sei
divergenze. Cinque sono **latenti**: si manifestano solo con uno sconto di
riga o una riga omaggio, entrambi oggi cablati a zero in
`src/lib/services/receipt-service.ts`. La sesta è **attiva ora**.

**Attiva.** `prezzoLordo` viene inviato come `unitPriceGross × quantity`,
mentre il portale invia il prezzo **unitario** e ricava `imponibile` come
`prezzoUnitario × quantita`. L'AdE accetta (i totali quadrano comunque) ma
**ricalcola** la colonna "Prezzo complessivo €" del PDF che stampa: su una
riga con quantità > 1 il valore stampato può risultare moltiplicato una volta
di troppo. Le nostre superfici (PDF, ricevuta pubblica, stampa termica) non
sono toccate: derivano da `src/lib/receipts/receipt-totals.ts`, che è
corretto.

**Latenti (bloccano lo sconto di riga).**

1. `scontoTotale` riceve Σ `scontoLordo`; deve ricevere Σ `scontoUnitario`
   (lo sconto **netto** IVA). Coincidono solo sulle nature `N*`.
2. `scontoUnitario` di riga riceve `line.unitDiscount` (lordo, per unità);
   deve essere `scontoLordo / (1 + r/100)`.
3. I netti (`prezzoUnitario`, `imponibile`, `imponibileNetto`, `importoIVA`)
   sono arrotondati ai centesimi, mentre il portale li calcola a piena
   precisione e li serializza a 8 decimali. Con uno sconto su riga con IVA
   questo sbilancia di **un centesimo** il PDF stampato dall'AdE
   (`imponibile netto + IVA ≠ totale complessivo`) — `HAR.md` voce #10.
4. `ammontareComplessivo` somma anche le righe `omaggio: "Y"`, che il portale
   **esclude** (`HAR.md` voce #7). Dormiente finché `isGift` resta `false`.
5. `flagIdentificativiModificati` vale `true`, il portale manda `false`.
   L'AdE accetta entrambi: annotato per non ri-scoprirlo, non da cambiare
   senza motivo.

**Fix.** Procedura completa, formule e test obbligatori: `HAR.md` voce #14,
sub-task A. Vincolo da non rompere: i **lordi** restano in centesimi interi
per riga (regola 17 di `CLAUDE.md`, REVIEW.md #57) — cambia solo la
scomposizione netto/IVA, che va a piena precisione. I due oracoli sono i
documenti reali delle voci #1 (qta 1, IVA 10%, sconto) e #12 (qta 2, IVA 22%,
sconto), entrambi accettati dall'AdE.

**Ordine.** Questo fix è **prerequisito** dello sconto di riga: implementarlo
dopo significherebbe spedire documenti fiscali sbilanciati di un centesimo.

---

## P3 — Bassa priorità

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

### 86. Screenshot `riepilogo-pagamento.png` da rifare dopo il rename "Carta" → "Elettronico"

- **Categoria:** contenuti marketing · **Severità:** Low — nessun impatto funzionale, ma il sito mostra una UI che non esiste più
- **File:** `public/screenshots/riepilogo-pagamento.png`. Riferimento: `src/app/(marketing)/help/primo-scontrino/page.tsx` (unico consumatore)

**Problema.** L'immagine ritrae la schermata "Riepilogo scontrino" con il
bottone **Carta** selezionato e la riga di helper "Per la Lotteria degli
Scontrini — solo pagamenti con carta". Entrambe le stringhe sono state
rinominate in "Elettronico" / "solo pagamenti elettronici": lo screenshot ora
contraddice sia il prodotto sia il testo dell'articolo che lo incornicia, ed è
il primo posto in cui un nuovo utente vede il selettore.

Il testo dell'articolo è già stato aggiornato: resta solo il bitmap.

**Da fare.** Rigenerare l'immagine dall'app dev con lo stesso inquadramento
(cornice telefono, carrello di 2 righe "Caffe espresso" 1,20 € e "Cappuccino"
1,50 €, totale 2,70 €, metodo elettronico selezionato, campo lotteria vuoto) e
sostituire il file mantenendo nome e proporzioni — è dichiarato
`width={900} height={1860}` nel `page.tsx`, cambiarle sposterebbe il layout.
Si può guidare un browser reale con la skill `playwright-verify`
(`browser_take_screenshot` funziona).

**Verificati e da NON rifare:** `cassa-tastierino.png`, `storico-dettaglio.png`
e gli altri in `public/screenshots/` non mostrano il selettore del metodo di
pagamento.

---

### 90. L'export CSV usa ancora `created_at`, non `ade_registered_at`

- **Categoria:** coerenza dei dati fiscali · **Severità:** Low — scarto di 2-5s, visibile solo a cavallo della mezzanotte o di un cambio periodo
- **File:** `src/lib/receipts/csv-export.ts`, `src/server/export-actions.ts`

**Problema.** Con la v1.7.0 tutte le superfici di resa (PDF, termica, ricevuta
pubblica, elenco storico) mostrano `ade_registered_at`, l'istante che l'AdE
registra. L'export CSV è rimasto indietro su due fronti: stampa
`formatIsoInRome(doc.createdAt)` nella colonna data, e **filtra l'intervallo**
con `gte/lt` sullo stesso `created_at`. Un documento emesso alle 23:59:58 con
registrazione AdE alle 00:00:01 finisce nel CSV del giorno prima, con una data
diversa da quella sul documento consegnato al cliente.

**Perché non è stato fatto insieme al resto.** Non è un rename simmetrico agli
altri: qui la colonna non è solo mostrata, è anche il **predicato di
selezione** del periodo — ed è quello che un commercialista usa per chiudere
un mese. Cambiare la sola colonna mostrata lascerebbe un CSV in cui la data di
una riga contraddice il filtro che l'ha inclusa; cambiare anche il filtro è
una decisione contabile, non un refactoring.

**Da fare.** Decidere quale delle due grandezze definisce il periodo fiscale
(propendo per `ade_registered_at`: è la data del documento presso l'AdE) e
spostare colonna **e** filtro insieme. Attenzione all'indice: le condizioni di
range oggi poggiano su `idx_commercial_documents_business_created`, quindi
serve un indice equivalente su `(business_id, ade_registered_at)` nella stessa
migrazione, o l'export su un anno di dati passa a sequential scan.

---

### 91. Il recovery stale-pending non scrive `ade_registered_at`

- **Categoria:** coerenza dei dati fiscali · **Severità:** Low — riguarda le sole righe riconciliate, ma è il caso in cui lo scarto è massimo
- **File:** `src/lib/services/receipt-service.ts` (`finalizeSaleOnly`), `src/lib/services/void-service.ts` (`finalizeVoidOnly`), `src/lib/services/ade-recovery.ts`

**Problema.** `finalizeSaleOnly` e `finalizeVoidOnly` chiudono una riga stale
portandola ad `ACCEPTED`/`VOID_ACCEPTED` ma **non** toccano
`ade_registered_at`: la colonna resta sul `DEFAULT now()` scritto all'INSERT.
Sul percorso normale lo scarto fra i due valori è la latenza del round-trip
(2-5s); qui la riga è stale **per definizione** — è rimasta PENDING oltre
`getStalePendingThresholdMs` — quindi il documento consegnato al cliente porta
un orario che può precedere di minuti quello registrato dall'AdE. È
esattamente lo scarto che la migrazione 0031 esiste per eliminare, ed è
silenzioso: nessun log segnala che la data stampata non è quella autorevole.

**Il dato autorevole è già in mano.** `AdeDocumentSummary.data`
(`src/lib/ade/types.ts:291`, formato `DD/MM/YYYY HH:MM:SS`) arriva da
`searchDocuments` ed è lo stesso campo che `HAR.md` #16b dà per coincidente
col timestamp del PDF ufficiale. `reconcileSaleDocument`/`reconcileVoidDocument`
lo filtrano già: basta farlo risalire fino alla UPDATE di finalizzazione.

**Da fare.** Portare il documento AdE riconciliato (non il solo `idtrx` +
progressivo) fino a `finalizeSaleOnly`/`finalizeVoidOnly`, convertire `data`
in `Date` — attenzione: è **ora italiana**, non UTC, e il formato è
`DD/MM/YYYY`, non parsabile da `new Date()` — e passarlo alla `.set()` con la
stessa semantica di `adeRegisteredAtPatch`: si scrive solo se leggibile, mai
un `Invalid Date` su un `timestamptz NOT NULL`.

---

### 92. Lo storico filtra e ordina su `created_at` ma mostra `ade_registered_at`

- **Categoria:** coerenza dei dati fiscali · **Severità:** Low — visibile solo a cavallo della mezzanotte · **Gemello di #90**
- **File:** `src/server/storico-actions.ts` (`searchReceipts`: `gte/lt` sul filtro data, `orderBy desc(createdAt)`)

**Problema.** Stessa asimmetria di #90, ma sull'elenco invece che sull'export:
la colonna mostrata è `ade_registered_at` (`storico-client.tsx`), il predicato
di selezione del periodo e l'ordinamento sono su `created_at`. Una vendita
creata il 31/01 alle 23:59:58 e registrata dall'AdE il 01/02 alle 00:00:01
compare filtrando gennaio, con scritto accanto `01/02/2026`. In più
l'ordinamento può risultare non monotono rispetto alla colonna mostrata quando
due scontrini ravvicinati hanno round-trip AdE di durata diversa.

**Perché non è stato fatto nella v1.7.0.** Identica a #90: qui la colonna non è
solo mostrata, è il predicato che definisce il periodo. Va decisa una volta e
spostata ovunque insieme — elenco, export CSV e (a una futura `/api/v2`) la
Developer API, che oggi filtra e restituisce `createdAt` ed è contratto
pubblico versionato, quindi correttamente intoccabile.

**Da fare.** Trattare #90 e #92 come un solo intervento: stessa decisione
contabile, stesso indice nuovo su `(business_id, ade_registered_at)` — le
condizioni di range oggi poggiano su
`idx_commercial_documents_business_created`.

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

### 87. Developer API v2: `payments[]` canonico al posto di `paymentMethod` scalare

- **Categoria:** tech debt / contratto API · **Severità:** Low — nessun bug, è
  il debito che si contrae scegliendo di non rompere `/api/v1`
- **File:** `src/app/api/v1/receipts/route.ts`,
  `src/app/api/v1/receipts/[id]/route.ts`,
  `src/lib/receipts/receipt-schema.ts`, `DEVELOPER.md`

**Contesto.** Il documento commerciale AdE ammette fino a sei importi di
pagamento sullo stesso scontrino (`PC`, `PE`, `TR`, `NR_EF`, `NR_PS`,
`NR_CS`) più un abbuono a livello documento (`scontoAbbuono`), con
l'invariante `Σ importi + scontoAbbuono = ammontareComplessivo`. Anatomia
completa, formule e casi di riferimento in `HAR.md` (voci #5, #6, #3b).

La nostra Developer API modella il pagamento come **uno scalare**,
`paymentMethod: "PC" | "PE"`, sia nel body di `POST /api/v1/receipts` sia
nelle response di lettura. Poiché `/api/v1` ha consumer esterni (regola 28b di
`CLAUDE.md`: breaking change solo con un nuovo path di versione), il supporto
al pagamento misto viene introdotto in modo **additivo**: `payments[]`
opzionale in input (mutuamente esclusivo con `paymentMethod`), ed entrambi i
campi in output — `paymentMethod` valorizzato sugli scontrini a metodo
singolo, `null` sui misti.

**Il debito.** Restano due rappresentazioni della stessa cosa: due rami di
validazione nello schema Zod, due campi da tenere coerenti in ogni response,
e un `paymentMethod: null` che un client ingenuo legge come "metodo
sconosciuto" invece che "più metodi". Ogni superficie di lettura deve passare
per l'helper di normalizzazione invece di leggere il campo che preferisce.

**Da fare in `/api/v2`.** Path di versione nuovo, `/api/v1` congelato:

1. `payments[]` diventa l'**unico** modo di dichiarare il pagamento, sempre un
   array anche con un solo elemento. `paymentMethod` sparisce da body e
   response.
2. Valutare l'apertura di `TR` (con `numero`) e delle tre `NR_*`, oggi
   deliberatamente fuori dallo schema pubblico pur essendo già mappate in
   `PAYMENT_TYPE_MAP` (`src/lib/ade/mapper.ts`). Sigle, etichette AdE e limiti
   noti: `HAR.md` voce #6. **`NR_EF` non è un importo** ma un flag `'Y'`/`'N'`
   mutuamente esclusivo con ogni altro pagamento: nel nostro modello sarebbe un
   booleano, non un `PaymentRequest`, e la formula
   `totaleNonRiscosso = NR_EF + NR_PS + NR_CS` — che `mapSaleToAdePayload`
   implementa e che oggi dà `0.00` per pura coincidenza — va verificata con una
   cattura prima di poggiarci sopra qualunque cosa.
3. Esporre `globalDiscount` (sconto a pagare) e `unitDiscount` di riga come
   campi di primo livello, se nel frattempo sono stati spediti.
4. Rimuovere il ramo di compatibilità dallo schema condiviso
   (`src/lib/receipts/receipt-schema.ts`) invece di duplicarlo: `/api/v1`
   resta sulla sua copia congelata. Nessun compat layer interno oltre il
   confine di versione (regola 28).

**Trigger di riapertura.** Quando il pagamento misto è live e i consumer
esterni dell'API sono stati avvisati; oppure quando serve esporre `TR`/`NR_*`,
che sullo scalare non sono rappresentabili affatto.

---

### 89. `VOID_ACCEPTED` ha due significati a seconda del `kind`

- **Categoria:** tech debt / modello dati · **Severità:** Low — nessun bug
  aperto: la conseguenza pratica è coperta da `isPrintableDocument`
- **File:** `src/db/schema/commercial-documents.ts` (`documentStatusEnum`),
  `src/lib/receipts/printable-document.ts`,
  `supabase/migrations/0012_fix_void_unique_index.sql`,
  `src/app/api/v1/receipts/route.ts`

**Problema.** Lo stesso valore d'enum porta due informazioni diverse: su una
riga `kind: "SALE"` significa "questa vendita è stata annullata", su una riga
`kind: "VOID"` significa "questo annullo è riuscito". Nessun predicato sul solo
`status` può quindi esprimere una regola che dipende da entrambi — ed è
esattamente ciò che ha nascosto la ricevuta di annullamento: il filtro
`status = 'ACCEPTED'` copiato in `fetchPublicReceipt` e nella route PDF
escludeva sia la vendita annullata (giusto) sia il suo annullo (sbagliato).

**Perché non è stato risolto spostando i dati.** L'alternativa valutata in
v1.7.0 era migrare i VOID riusciti ad `ACCEPTED`, rendendo la condizione
monodimensionale. Scartata per tre ragioni concrete:

1. L'indice unique parziale della migrazione 0012 ha
   `status IN ('PENDING', 'VOID_ACCEPTED')` cablato nel predicato: i VOID
   riusciti ne uscirebbero e sparirebbe la **guardia atomica contro il doppio
   annullo** dello stesso SALE. La conseguenza è un annullo fiscale duplicato
   su AdE, irreversibile; il controllo applicativo che resterebbe è
   TOCTOU-vulnerabile (skill `db-migrations`: constraint DB > lock applicativo).
2. `status` è esposto in risposta da `/api/v1` e i suoi valori sono documentati
   agli sviluppatori esterni in `src/app/(marketing)/help/api/page.tsx`:
   cambiarlo è un breaking change su contratto pubblico versionato — regola 28
   eccezione (b).
3. Blast radius ampio e coordinato con una migrazione dati: `csv-export.ts` (il
   JOIN che trova l'annullo proprio via `status = 'VOID_ACCEPTED'`),
   `STATUS_VALUES` in export route e storico page, badge e filtro in
   `storico-client.tsx`, `types/storico.ts`, `public-types.ts`.

**Verificato che NON è un problema:** le analytics reggerebbero comunque —
`analytics-actions.ts` filtra già `kind = 'SALE'`, quindi le righe VOID non
entrano in `computeKpis` e non ci sarebbe doppio conteggio del fatturato.

**Mitigazione in essere.** La regola bidimensionale vive in un posto solo,
`printable-document.ts`, che i lettori chiamano invece di riscrivere il
predicato. Non è un tappabuchi: è la modellazione corretta di una condizione su
`(kind, status)`.

**Da fare in `/api/v2`** (insieme alla voce #87, stesso confine di versione):
separare i due significati — per esempio `ACCEPTED` su entrambi i kind più un
flag/timestamp `voided_at` sul SALE — riscrivendo il predicato dell'indice 0012
**nella stessa migrazione**, mai in un PR separato.

**Trigger di riapertura.** L'apertura di `/api/v2`, oppure il primo caso in cui
un terzo stato dipendente dal `kind` (il reso, `R`/`RX`) rende la sovrapposizione
insostenibile.

---

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
