# REVIEW.md — Registro bug noti e tech debt

> **Ultimo audit:** 2026-08-02 (full-codebase, `main` @ b834286 — passate
> sicurezza / performance / funzionalità / architettura / bad practice)

**Scopo.** Registro canonico dei bug noti, del tech debt e dei miglioramenti di
sicurezza/performance, ordinati per priorità (P1/P2/P3). `PLAN.md` resta la
roadmap delle **funzionalità**. Quando un finding viene risolto, rimuoverlo nel
PR del fix; quando un audit ne trova di nuovi, aggiungerli nella sezione di
priorità corretta.

**Numerazione.** Un finding nuovo prende il primo numero libero: i numeri sono
stabili e non si riciclano (il codice e i doc citano "REVIEW.md #N"), quindi i
buchi lasciati dalle voci risolte restano buchi. `npm run arch:check` fallisce
se due voci condividono lo stesso numero — è già successo con due branch
aperti in parallelo, che avevano preso lo stesso numero libero rispetto alla
propria base e si sono fusi senza conflitto.

Ogni finding è autoconsistente: deve poter essere implementato leggendo solo la
sua sezione, nel rispetto delle regole sempre-attive di `CLAUDE.md` (branch
separato, TDD, edge case prima del commit, una slice = un contratto verificabile
da solo, ledger delle decisioni in consegna). I trade-off consapevoli accettati
vivono in fondo, in "Rischi accettati".

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

### 103. Una riga `PENDING` orfana resta a esito AdE ignoto, e nessuna superficie la mostra

- **Categoria:** coerenza dei dati fiscali / osservabilità · **Severità:**
  Medium — nessun dato corrotto e nessun doppione nel nostro DB, ma l'esito AdE
  di una riga `PENDING` orfana resta ignoto a tempo indefinito e nessuna
  superficie lo segnala
- **File:** `src/lib/services/receipt-service.ts:275` (ramo `alreadyExists`),
  `:322` (`handleExistingReceipt`), `:454` (gate `isStale`);
  `src/lib/services/ade-recovery.ts` (`getStalePendingThresholdMs`,
  `claimStaleDocument`, `buildAdeSearchWindow`, `reconcileSaleDocument`);
  `src/components/cassa/cassa-client.tsx:287`;
  `src/components/storico/void-receipt-dialog.tsx:62`;
  `src/server/storico-actions.ts:228`; `src/server/analytics-actions.ts:206`;
  `src/server/admin-metrics.ts`; `src/instrumentation.ts:155`

**Problema.** Tre difetti si sommano e producono una riga che nessuno
riconcilierà mai.

1. **La stale-recovery è pull-based.** L'unico ingresso è il ramo
   `alreadyExists` dell'INSERT `onConflictDoNothing`: la riconciliazione con AdE
   parte solo quando un secondo tentativo collide sul vincolo UNIQUE
   `(business_id, idempotency_key)`. Senza collisione di chiave non c'è claim,
   non c'è `searchDocuments`, non c'è finalize.
2. **La cassa conia una chiave nuova a ogni submit** (`crypto.randomUUID()`
   dentro `handleSubmit`). Il retry dopo un fallimento non collide: inserisce
   una riga nuova e lascia la precedente `PENDING` per sempre. Stesso effetto
   per un client API che ritenta con una chiave nuova.
3. **Nessuna superficie mostra i `PENDING`.** Storico e analytics filtrano
   `IN ('ACCEPTED','VOID_ACCEPTED')`, le metriche admin contano `ACCEPTED`. Le
   righe orfane non fanno rumore e non gonfiano il fatturato, ma non le vede
   nessuno: chi lavora al repo le trova solo ispezionando il DB a mano.

La conseguenza è il rovescio del doppione che di solito si teme. Non due
documenti da noi, ma **un documento che potrebbe esistere su AdE e non nel
nostro DB**, oppure un corrispettivo mai trasmesso. Le due ipotesi sono
indistinguibili senza interrogare il portale, ed entrambe restano invisibili.

Il ramo è raro, si attiva solo quando l'esito AdE è ignoto (rete, 5xx, timeout),
ma quando scatta produce ambiguità fiscale permanente.

**Il meccanismo esiste già, manca solo chi lo chiami.** `reconcileSaleDocument`
fa il match sull'importo esatto in cents, con il comparatore legacy per i
documenti emessi prima di #57. `buildAdeSearchWindow` costruisce la finestra
±24h da `createdAt`, quindi funziona anche su righe vecchie di settimane, non
solo a caldo. `claimStaleDocument` serializza due retry concorrenti con un CAS
su `updated_at`. Su una riga orfana `updated_at` è ancora identico a
`created_at`: dopo l'INSERT non l'ha toccata nessuno.

Un dettaglio guida il fix. È proprio la misura anti-doppione, la chiave nuova a
ogni submit, a tenere chiuso l'unico ingresso della recovery.

**Cosa NON è il problema.**

- **Il contratto `/api/v1` è già corretto.** `ADE_UNAVAILABLE`
  (`api-v1-errors.ts:132`) è `503`, `retryable: true`, `Retry-After: 10`, e il
  catalogo prescrive testualmente di ritentare con la **stessa**
  `idempotencyKey`. Un integratore che ne conia una nuova viola un contratto
  documentato, e nessuna modifica all'API lo impedirebbe: l'endpoint non può
  distinguere una vendita nuova legittima da un retry mascherato. È materia da
  supporto all'integratore, non da codice.
- **Il flusso di annullo fa già la cosa giusta.**
  `useState(() => crypto.randomUUID())` tiene la chiave stabile per la vita del
  dialog. L'emissione è l'anomalia interna, non una scelta di design.

**Fix: tre slice, in quest'ordine.**

**Slice 1, il rilevatore.** Un conteggio dei `PENDING` oltre soglia su una
superficie già esistente: `admin-metrics.ts` usa già la stessa forma
`count(*) FILTER (WHERE …)` sulla stessa tabella. In alternativa, o in aggiunta,
un `logger.warn` periodico che li conta e arriva su Sentry Logs con l'impianto
già attivo. Criterio di uscita: leggere quel numero non richiede una sessione
SQL. **Test:** riga sotto soglia non contata; oltre soglia contata; `ERROR`
trattato come la slice decide, e verificato; nessun `PENDING` → zero, senza log
di rumore.

Va per prima perché è il rilevatore. Senza, nessuno sa se le slice 2 e 3
funzionano, e il difetto torna scopribile solo per caso.

**Slice 2, "verifica stato" dentro la sessione dell'esercente.** È il pezzo che
chiude il buco.

1. Avviso non bloccante (banner, non righe nello storico) quando esiste un
   `PENDING` oltre soglia. Storico e analytics continuano a filtrare
   `ACCEPTED/VOID_ACCEPTED`: il banner non sporca la lista con righe che
   potrebbero non essere nulla.
2. Azione esplicita che chiama `reconcileSaleDocument` **dentro la sessione
   utente**, dove le credenziali AdE sono già disponibili.
3. Match → finalize ad `ACCEPTED` con `ade_registered_at` autorevole, la stessa
   strada di #91. Nessun match → `ERROR` e invito a riemettere.
4. Match ambiguo (stesso importo più volte nello stesso giorno) → la UI mostra i
   candidati e sceglie l'esercente. **Mai una scelta automatica.** L'esercente è
   l'unico anello della catena che sa se la vendita è avvenuta.
5. **Test:** match singolo; nessun match; candidati multipli; claim concorrente
   perso (CAS → risposta in-progress, nessuna ri-sottomissione); riga già
   finalizzata da un'altra sessione nel frattempo.

**Slice 3, chiave di idempotenza stabile in cassa.** Stabile per carrello, con
due rotazioni obbligatorie.

1. **Su emissione riuscita.** Senza, la vendita successiva riceve il successo
   idempotente della precedente e non emette nulla.
2. **A ogni modifica del carrello.** Senza, un ritocco alle righe produce
   `IDEMPOTENCY_PAYLOAD_MISMATCH` e blocca l'utente.

Con entrambe, l'unico caso di blocco è "carrello identico, riprovo entro la
soglia stale", cioè esattamente il caso in cui ri-sottomettere è pericoloso.

**Questa slice va dopo la 2, non prima.** Da sola peggiora l'esperienza: oggi
chi riclicca ottiene uno scontrino e rischia il doppione, dopo otterrebbe
"ancora in elaborazione" fino alla soglia, con il cliente al banco. Solo quando
la verifica della slice 2 esiste, l'utente bloccato ha qualcosa da premere.

**Test:** carrello identico ritentato → stessa chiave; emissione riuscita →
chiave nuova; qualsiasi modifica al carrello → chiave nuova; stato bloccato →
la UI offre la verifica della slice 2.

**Cosa non fare.**

- **Sweep automatico in `instrumentation.ts`.** L'impianto ci sarebbe, due sweep
  in-process già girano lì, ma non ha una sessione AdE: dovrebbe decifrare le
  credenziali fuori da una request utente e fare un login per ogni business con
  righe orfane. È il contrario di "leggeri sulle risorse" per un evento raro, e
  sposta la decisione lontano dall'unica persona che conosce la verità. Da
  riaprire solo se il rilevatore della slice 1 mostrasse accumulo su un canale
  dove nessun umano ripassa mai.
- **Dedup a contenuto su finestra temporale.** Due vendite identiche a pochi
  minuti di distanza sono ordinaria amministrazione in parecchi settori: un
  blocco automatico rifiuterebbe una vendita vera per proteggere da un errore
  ipotetico. Al massimo un avviso non bloccante, e non in queste tre slice.
- **Abbassare `STALE_PENDING_THRESHOLD_MINUTES` alla cieca.** Richiederebbe
  sapere quanto ci mette un documento appena registrato a diventare cercabile su
  AdE, un dato che non abbiamo. Sbagliarlo significa ri-sottomettere un documento
  che AdE ha già accettato, irreversibile. Le due rotazioni della slice 3 rendono
  il blocco abbastanza raro da non dover toccare la soglia.

**Chiusura.** Il finding si chiude quando le tre slice sono spedite. Fino ad
allora resta aperto anche se in quel momento non c'è nessuna riga orfana: il
difetto è il meccanismo, non le righe.

---

## P3 — Bassa priorità

### 102. `cassa-client.tsx` è escluso dalla coverage ma ora ha dei test

- **Categoria:** tech debt · **Severità:** Low — nessun rischio in produzione, solo misura mancante
- **File:** `vitest.config.ts`, `sonar-project.properties`, `src/components/cassa/cassa-client.test.tsx`

Il file è elencato fra le esclusioni di coverage in entrambi i config con la
motivazione "UI orchestrator — pure render + setState, no testable logic". Da
`src/components/cassa/cassa-client.test.tsx` quella motivazione non è più
interamente vera: il gating fra `canAdd`, il link sconto e il CTA "Aggiungi" è
logica, ed è testata.

L'esclusione è rimasta di proposito. Toglierla significa pretendere l'80% di
coverage on new code su un orchestratore di ~600 righe che oggi ne ha misurate
zero: è un lavoro suo, non la coda di un fix di layout.

Quando lo si affronta, la sequenza che costa meno è: coprire prima i tre step
(`cart`, `add-item`, `summary`) col mock di `useMutation` già scritto nel file
di test, poi togliere il path dalle due liste nello stesso PR — mai prima, o il
quality gate diventa rosso su una PR che non c'entra.

### 100. DMARC su `.it`: alzare la policy da `p=none` dopo i report

- **Categoria:** email security · **Severità:** Low — la visibilità c'è, manca l'enforcement
- **File:** nessuno nel repo. Un record TXT nella zona Cloudflare `scontrinozero.it`

Il grosso è chiuso (2026-08-27): `scontrinozero.com` è dichiarato non-mail e
inspoofabile (null MX, `v=spf1 -all`, `p=reject`), e `.it` pubblica
`v=DMARC1; p=none; rua=mailto:info@scontrinozero.it; fo=1` con il record di
autorizzazione `scontrinozero.com._report._dmarc` che fa arrivare anche i
report della zona `.com`.

Resta il solo passo che richiede di **aspettare i dati**: `p=none` dice ai
destinatari di non fare nulla. Dopo 2-4 settimane di report, se gli unici
mittenti allineati sono iCloud (apex) e Amazon SES (`send.mail.scontrinozero.it`,
usato da Resend come return-path), alzare la policy:

```
v=DMARC1; p=quarantine; rua=mailto:info@scontrinozero.it; fo=1
```

e dopo altre due settimane senza sorprese, `p=reject`. Nello stesso passaggio
stringere l'SPF dell'apex da `~all` a `-all`: farlo insieme al salto di policy
tiene le due modifiche distinguibili se qualcosa si rompe.

I report si leggono senza XML attivando **Email → DMARC Management** sulla zona.

### 96. Arrotondamento DL 50/2017: manca la voce di pagamento `Arro. DL N.50/2017`

Il layout normativo del documento commerciale (`HAR.md` voce #17d) prevede che
l'arrotondamento obbligatorio dell'art. 13-quater DL 50/2017 — in vigore dal
1° gennaio 2018: quando si paga **integralmente in contanti** l'importo va
arrotondato al multiplo di 5 centesimi più vicino — si stampi con una
voce di pagamento dedicata, `Arro. DL N.50/2017`, **in aggiunta** allo sconto a
pagare quando l'arrotondamento è per difetto.

Oggi l'esercente che arrotonda per difetto usa lo sconto a pagare e ottiene un
documento **corretto nei totali e nella quadratura**, ma senza quella dicitura;
l'arrotondamento per eccesso non è esprimibile affatto (servirebbe una voce di
pagamento in più del corrispettivo).

**La regola aritmetica è nota** (owner, 27/08/2026) e non è più una delle
incognite: si arrotonda per **difetto** quando i centesimi finiscono in
1, 2, 6, 7 (5,02 € → 5,00 €) e per **eccesso** quando finiscono in 3, 4, 8, 9
(5,03 € → 5,05 €); su 0 e 5 non si fa nulla. Si applica **solo al pagamento
integralmente in contanti** — su un pagamento misto mai, basta una quota
elettronica — si calcola **sul totale** e non sul singolo prezzo, e **non
tocca la base imponibile IVA**. La dicitura contabile standard per il caso in
eccesso è `Arrotondamento a pagare`; il layout normativo la chiama
`Arro. DL N.50/2017`.

Resta da chiarire una cosa sola, e non è misurata: **come (e se) il tracciato
del _documento commerciale online_ esprima quella voce**. Il portale espone
sei slot di pagamento (`HAR.md` voce #6) e nessuno si chiama così; per
l'arrotondamento in eccesso servirebbe un importo che supera il corrispettivo,
cioè qualcosa che nessuna cattura ha mai mostrato. Serve un HAR fatto apposta.

Il caso per **difetto** è invece già producibile: è uno sconto a pagare, che
sappiamo rappresentare e trasmettere. Manca solo la dicitura dedicata.

Non blocca gli sconti né il pagamento misto: è il perimetro di ciò che non
risolvono.

### 94. Deploy skew: il reload salva la sessione ma non quello che l'utente aveva digitato

- **Categoria:** UX · **Severità:** Low — l'operazione non è mai stata
  registrata (il server rifiuta la chiamata prima di arrivare al nostro
  codice), si perde solo la digitazione
- **File:** `src/lib/deploy-skew.ts`, `src/app/onboarding/onboarding-form.tsx`

Con SCONTRINOZERO-Z il deploy skew non lascia più l'utente su una pagina morta:
il boundary lo riconosce e ricarica, prendendo il bundle della release nuova.
Resta però che il form riparte vuoto — nel caso osservato erano le credenziali
CIE appena inserite allo step 2 dell'onboarding, da ridigitare.

Il seguito naturale è persistere la bozza del wizard prima del reload
(`safeSessionStorage`, stesso store del marcatore) e reidratarla al
caricamento. Attenzione: le credenziali AdE sono il campo più fastidioso da
ridigitare **ed** è l'unico che non va scritto in Web Storage — password e PIN
Fisconline, password CIE restano fuori. Il recupero copre quindi i dati
anagrafici dello step 1 e la scelta del metodo, non i segreti: va valutato se
il beneficio residuo giustifichi il codice.

Trigger di riapertura: se lo skew comincia a colpire la cassa (emissione
scontrino) invece dell'onboarding, la priorità sale — lì la digitazione persa è
un carrello intero.

### 101. `/admin`: le metriche scontrini scandiscono tutto lo storico a ogni apertura

- **Categoria:** performance DB · **Severità:** Low (cresce col volume globale, non per-tenant) · **Parente di #81**
- **File:** `src/server/admin-metrics.ts` (`getAdminDocumentKpis`); tetto e budget in `src/server/admin-sql.ts` (`ADMIN_MAX_CONCURRENT_READS`, `ADMIN_QUERY_TIMEOUT_MS`)

**Problema.** Nessuna delle sei letture del pannello può usare un indice: tutti
quelli di `commercial_documents` sono prefissati `business_id`
(`supabase/migrations/0000_initial.sql:112-114`, `0032_…`) e il pannello, che
aggrega su **tutti** i tenant, non filtra mai per esercente. La lettura peggiore
è `getAdminDocumentKpis`: il predicato è `created_at < rangeEnd`, cioè **tutto
lo storico** a prescindere dal periodo scelto, perché servono `receipts_total` e
`revenue_cents_total`. Sopra ci va un `LEFT JOIN` su
`commercial_document_lines`, quindi il costo è ~O(righe di ogni scontrino mai
emesso), e restringere il range non lo tocca.

Lo streaming introdotto in questa slice **non riduce il carico**: sposta
soltanto l'attesa fuori dal percorso critico del render, così le altre cinque
letture e il guscio non aspettano questa. Il tetto `ADMIN_MAX_CONCURRENT_READS`
= 1 impedisce che il costo si moltiplichi sul pool, ma resta una scansione
completa che compete per la shared buffer cache con la cassa.

Oggi l'impatto è trascurabile (volumi bassi, pannello aperto da una persona);
diventa rilevante quando `commercial_documents` supera qualche centinaio di
migliaia di righe — la stessa soglia di #81.

**Fix (quando servirà).** Gli indici non bastano, serve materializzare:

1. Una tabella di rollup giornaliero per tenant (`business_id`, giorno fiscale
   Rome, scontrini accettati, centesimi, annullati), scritta in append
   all'emissione/annullo — o da uno sweep, come quelli già in
   `src/instrumentation.ts`. I totali storici diventano una somma su una
   tabella piccola invece che sulla tabella scontrini.
2. La formula dei centesimi **deve** restare quella di `lineCentsSql`
   (`admin-sql.ts`), gemello di `lineTotalCents` in
   `src/lib/receipts/receipt-totals.ts`: un rollup che arrotonda per documento
   invece che per riga farebbe divergere il pannello dagli scontrini veri
   (skill `money-rounding`).
3. Solo dopo il rollup ha senso guardare gli indici delle altre letture: un
   `profiles (created_at)` e un parziale su `plan = 'trial'` aiutano
   `getAdminUserKpis`, `getAdminRecentProfiles` e `getAdminTrialExpiring`, che
   sono già le veloci.
4. **Test:** il rollup somma quanto la query diretta sugli stessi dati (fixture
   condivisa fra le due strade); un annullo dopo l'emissione aggiorna entrambe
   le colonne. _Trigger:_ p95 di `getAdminDocumentKpis` sopra 2-3s, o
   `commercial_documents` oltre ~500k righe.

---

### 81. Sweep GDPR: la query candidati aggrega l'intera tabella `commercial_documents` a ogni giro

- **Categoria:** performance DB · **Severità:** Low (cresce col volume globale, non per-tenant)
- **File:** `src/lib/services/inactive-user-prune.ts:149-208` (SELECT candidati con `LEFT JOIN (… GROUP BY b.profile_id)`); cadenza in `src/instrumentation.ts` (`INACTIVE_USER_PRUNE_INTERVAL_MS`, 24h)

**Problema.** La SELECT dei candidati calcola l'ultima attività con un
`LEFT JOIN (SELECT b.profile_id, MAX(cd.created_at) FROM businesses b JOIN
commercial_documents cd ON cd.business_id = b.id GROUP BY b.profile_id)`: la
subquery **scansiona e aggrega l'intera tabella scontrini di tutti i tenant**,
anche se poi servono solo i pochi profili inattivi da 11+ mesi. Gira una volta
al giorno (più un run iniziale a 15 min dal boot, e il container dev si
ridéploya a ogni push su `main`).

Oggi l'impatto è trascurabile (volumi bassi); diventa rilevante quando
`commercial_documents` supera qualche centinaio di migliaia di righe.

**Il contenimento è spedito, l'ottimizzazione no.** I due aggravanti che non
erano gated a volume sono chiusi: la query gira dentro
`withStatementTimeout(PRUNE_CANDIDATES_QUERY_TIMEOUT_MS)` (30s, budget da job
di background) e il batch ha un `LIMIT PRUNE_CANDIDATES_BATCH_LIMIT` (500) con
ordinamento deterministico per inattività crescente. Sul `57014` lo sweep
degrada a contatori zero con `logger.warn` — non `error`, perché il retry è
implicito nel giro del giorno dopo e una issue Sentry per giro di contention
sarebbe solo rumore.

Erano stati separati dal resto perché sono **contenimento, non
ottimizzazione**: non riducono il costo della query, rendono limitato il suo
fallimento. Il motivo per non aspettare il volume: lo sweep pesca dallo stesso
pool da 10 (`src/db/index.ts`) che serve la cassa, quindi il degrado lo paga
l'emissione scontrino; e girando da `setInterval`, fuori da qualunque
richiesta, non produce una transaction Sentry — il trigger "p95 del sweep"
scritto qui sotto **non poteva scattare**, quindi il primo segnale sarebbe
stato l'incidente.

**Cosa resta (quando servirà).** Solo la parte che ha senso tarare su piani di
esecuzione veri:

1. Sostituire l'aggregato full-table con una subquery correlata `LATERAL` (o una
   scalare) valutata **solo** sui profili che hanno già superato il filtro
   temporale sui campi cheap (`created_at`, `last_sign_in_at`, `last_seen_at`) —
   esattamente la forma già usata in `reReadCandidate`, il cui commento
   spiega perché è più economica su un singolo profilo. In pratica: filtrare
   prima sui tre timestamp locali, poi verificare `MAX(cd.created_at)` solo sui
   sopravvissuti.
2. Valutare un indice su `commercial_documents (business_id, created_at DESC)` —
   `idx_commercial_documents_business_created` esiste già ed è sufficiente per la
   forma correlata del punto 1; **nessuna migration nuova** se si adotta quella.
3. **Test:** stessi candidati fra la forma correlata e quella attuale su una
   fixture condivisa; il `LIMIT` continua a valere.

_Trigger:_ `commercial_documents` oltre ~500k righe (leggibile su `/admin`),
oppure il primo `pruneInactiveUsers: query candidati oltre il budget` nei log —
che ora è il segnale che prima mancava.

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

### 91. Residuo: il finalize senza lookup AdE lascia `ade_registered_at` al default

- **Categoria:** coerenza dei dati fiscali · **Severità:** Low — scarto di secondi, nessun impatto su giorno contabile
- **File:** `src/lib/services/receipt-service.ts` (`finalizeSaleOnly`), `src/lib/services/void-service.ts` (`finalizeVoidOnly`)

**Risolto il caso principale.** Il finalize che segue una riconciliazione ora
scrive l'istante autorevole: `reconcileSaleDocument`/`reconcileVoidDocument`
portano `registeredAt` (il `data` del documento AdE, parsato da
`parseAdeResultDate`) fino alla UPDATE, che lo applica con
`adeRegisteredAtPatchFromDate`. Sulla riga stale — PENDING oltre
`getStalePendingThresholdMs` — lo scarto era di **minuti**, ed è quello che
finiva su PDF, storico, filtri per data ed export CSV.

**Cosa resta.** L'altro ramo che chiama le stesse funzioni — `adeTransactionId`
già persistito, cioè la sola UPDATE finale da ritentare — non interroga AdE per
scelta, quindi non ha un istante autorevole in mano e lascia il `DEFAULT now()`
dell'INSERT. Lì lo scarto è la finestra fra la response AdE ricevuta e la UPDATE
fallita: **secondi**, non minuti.

**Da fare: nulla, salvo evidenza contraria.** Chiudere anche questo ramo
richiederebbe una `searchDocuments` (sessione AdE, 2-5s) su un percorso nato per
non toccare la rete — sproporzionato rispetto a uno scarto di secondi. Da
riaprire solo se emergesse un caso reale in cui quei secondi spostano il giorno
contabile.

---

### 93. Residuo: due header di sandbox restano puntati a produzione

- **Categoria:** configurazione di deploy · **Severità:** Low — nessun impatto
  su produzione, nessuna superficie user-facing rimasta su sandbox
- **File:** `next.config.ts` (`headers()`, `allowedOrigin`),
  `src/lib/security-headers.ts`, `src/lib/csp.ts`
  (`buildReportingEndpoints`)

**Risolto il caso principale.** `deploy.yml` builda **una sola immagine per
tag**, che serve prod _e_ sandbox: `NEXT_PUBLIC_APP_URL` è quindi bakata col
valore di produzione anche nel container sandbox, dove l'unico segnale
runtime che distingue l'ambiente è `APP_HOSTNAME` (dal compose). Passarla come
build-arg — il fix ipotizzato in origine — non è praticabile senza buildare
due immagini diverse, cioè senza che sandbox smetta di testare il binario che
va in produzione.

Le tre superfici che leggevano quel valore **a runtime** ora seguono
`APP_HOSTNAME`, con la stessa precedenza che `resolveBaseUrl()`
(`src/lib/marketing-to-app-href.ts`) documenta da sempre come pattern "single
image, per-env runtime override":

1. `getTrustedAppUrl()` (`src/lib/trusted-app-url.ts`) — QR stampato sui PDF e
   `success_url`/`cancel_url`/`return_url` di Stripe;
2. `src/components/marketing/header.tsx` — l'href `/login` è ora risolto nel
   server parent `src/app/(marketing)/layout.tsx` e passato come prop, invece
   di essere ricalcolato in hydration sul default hardcoded di produzione
   (regola 15);
3. `src/emails/welcome.tsx` — il CTA della mail di benvenuto.

**Cosa resta.** Due header sono costruiti da `next.config.ts` e **serializzati
al build** nel manifest, quindi nessuna env runtime può cambiarli:

- `Access-Control-Allow-Origin` su `/api/*` vale
  `https://app.scontrinozero.it` anche su sandbox. Impatto pratico ~zero: le
  chiamate dell'app sono same-origin, la CORS non entra in gioco.
- `Reporting-Endpoints` manda i **CSP report di sandbox all'endpoint di
  produzione** — cross-talk fra ambienti che sporca i report di prod se
  qualcuno testa una policy su sandbox.

**Da fare (quando servirà).** Due strade, entrambe accettabili, nessuna
tappabuchi:

1. Spostare i due header dal `headers()` statico a `src/proxy.ts`, che gira a
   runtime e vede `APP_HOSTNAME` — è anche il prerequisito già previsto dalla
   voce #13 (CSP per route group con nonce per-richiesta), quindi conviene
   farli insieme.
2. Oppure accettare il divario e documentarlo, se #13 resta fermo.

_Trigger:_ il primo test di una policy CSP su sandbox, oppure l'apertura del
prerequisito di #13.

---

### 95. Deep-link `#api-keys` morto: nessun elemento con quell'id

- **Categoria:** UX · **Severità:** Low
- **File:** `src/app/dashboard/page.tsx:42`, `src/app/dashboard/cassa/page.tsx:36`
  (redirect); `src/components/settings/api-key-card.tsx` (card di destinazione)

**Problema.** I piani `developer_*` senza cassa nel dashboard vengono rediretti a
`/dashboard/settings#api-keys`, ma **nessun elemento della pagina ha
`id="api-keys"`** — `ScrollToHash` non trova il target e l'utente atterra in cima
alle Impostazioni senza capire dove andare. Peggiorato dal fatto che la card API
key vive dentro `ExtraSettingsSection`, **chiusa di default**: anche con l'ancora
giusta il contenuto non sarebbe nel DOM al mount. Trovato durante il pass UX del
menu impostazioni (non introdotto da quel PR: l'ancora era già morta).

**Fix.** Due pezzi, entrambi necessari: (a) `id="api-keys"` + `scroll-mt-20` sulla
card API key, come già fatto per `id="billing"`; (b) far aprire
`ExtraSettingsSection` quando l'hash corrente punta a una delle sue card, così il
target esiste prima che `ScrollToHash` giri.

_Trigger:_ il primo utente `developer_*` che segue il redirect.

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

### 104. Le tre checklist manuali pre-PR non hanno un gate

- **Categoria:** tooling / qualità · **Severità:** Low — oggi sono coperte da
  prosa nelle skill, quindi valgono quanto l'attenzione di chi legge
- **File:** `eslint.config.mjs`, `.claude/skills/testing-patterns/SKILL.md`,
  `.claude/skills/sonar-quality-gate/SKILL.md`

**Problema.** Fino a questo PR `CLAUDE.md` chiudeva la sezione Pre-PR con
quattro caselle da spuntare a mano: ogni `it()`/`test()` ha almeno un
`expect()` (S6661, Blocker su SonarCloud), i mock di classi usano
`function`/`class` e non arrow, le variabili nei factory `vi.mock` iniziano per
`mock` (hoisting Vitest), nessuna nuova issue Blocker/Critical. Le prime tre
sono regole di lint travestite da prosa: deterministiche, verificabili
staticamente, e violate esattamente quando chi committa ha fretta — cioè quando
la checklist manuale non viene letta. La quarta non è automatizzabile in locale
(la calcola SonarCloud) e resta correttamente un controllo di CI.

Sono state tolte dal prompt perché una regola che paghi in contesto a ogni task
senza che nessun gate la applichi è il peggiore dei due mondi (regola 7: la
prosa converge verso un hook o un test, e quando il gate esiste la prosa
sparisce). La prosa vive ora nelle skill `testing-patterns` e
`sonar-quality-gate`, che si attivano quando stai scrivendo test.

**Cosa manca.** Il gate vero, per le tre regole locali. Solo la prima ha
un'implementazione già pronta a scaffale — `expect-expect` di
**`@vitest/eslint-plugin`** (v1.6.27 al 2026-08-21; il vecchio nome
`eslint-plugin-vitest` è fermo a 0.5.4, la famiglia si è rinominata). Oggi non
è tra le devDependencies. Le altre due sono regole custom brevi da scrivere in
`eslint.config.mjs`, verosimilmente due `no-restricted-syntax` sui factory
`vi.mock` — una che vieta le arrow function come valore di ritorno di un mock
di classe, una che pretende il prefisso `mock` sugli identificatori catturati
dalla closure. Prima di scriverle, controllare se una regola pubblicata le
copre già (regola 29).

**Vincolo.** Pesare l'aggiunta contro "dipendenze minime" (regola 29 e Principi
guida): un plugin ESLint è dev-only e non entra nel container, quindi il costo è
accettabile, ma va verificato che non rallenti `npm run lint` in CI.

**Dimensione: da misurare prima di impegnarsi.** La superficie è **4160**
`it()`/`test()` in **276** file (misurato il 2026-08-21). Accendere
`expect-expect` può produrre zero violazioni o duecento, e non si sa finché non
lo si esegue. Quindi il primo passo non è l'implementazione ma la **scoperta**:
installare il plugin in locale, accendere la regola in warning, contare. Se le
violazioni sono poche il fix è una slice sola; se sono molte, la bonifica è una
slice a parte dall'attivazione del gate (regola 5). Non aprire questo finding
come coda di un altro lavoro.

**Trigger.** La prima regressione S6661 che arriva da SonarCloud invece
che da `npm run lint`.

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

### Cloudflare Security Insights: Bot Fight Mode e AI Labyrinth restano off

I Security Insights delle due zone suggeriscono di attivarli. È una scelta
consapevole non farlo — vale per entrambe le zone, e l'insight tornerà a
proporli a ogni scansione.

**Bot Fight Mode — no.** Sul piano free agisce sull'intera zona: nessuna
esclusione per path, nessuna skip rule. Ma tutto ciò che entra qui via HTTP e
non è un browser è, per definizione, "automatico": la Developer API pubblica
`/api/v1` con Bearer key (`DEVELOPER.md`, consumer esterni), il webhook Stripe
su `/api/stripe/webhook`, le tre probe di smoke `/api/health/*` e il tunnel
Sentry `/monitoring`. Una challenge su questi path non è degrado, è rottura:
un client server-to-server non risolve un JS challenge e non segue redirect —
è la stessa classe di bug già pagata con i webhook Stripe rimbalzati 307
(vedi il commento su `/api/` in `src/proxy.ts`). Il rate limiting che serve
davvero è già applicativo, per-azione (skill `testing-patterns`).
**Riaprire:** se la zona passa a un piano Pro, dove Super Bot Fight Mode
ammette skip rule per path → valutarlo escludendo `/api/*` e `/monitoring`.
Oppure, se nei log comparisse scraping o credential stuffing reale, prima una
WAF rate-limit rule mirata su `/login` e `/register`, non una policy di zona.

**AI Labyrinth — no, e in particolare mai sulla zona marketing.** Serve a dare
in pasto contenuto-esca ai crawler AI. Qui la strategia dei contenuti è
l'opposto: `/llms.txt` e `/llms-full.txt` esistono apposta per farsi leggere,
e la checklist GEO della skill `marketing-content` (risposta secca in apertura,
fatti numerati citabili, FAQ) è scritta per **farsi citare** da ChatGPT,
Claude, Perplexity e AI Overviews. Attivarlo avvelenerebbe esattamente il
canale su cui il sito è costruito. **Riaprire:** solo se diventasse
attivabile per singolo hostname, limitandolo ad `app.` e `sandbox.` — che sono
già `noindex` e non hanno alcun valore SEO/GEO.

Il terzo insight della stessa famiglia, "Security.txt not configured", **è
invece stato accolto**: il file è servito dall'app
(`src/app/.well-known/security.txt/`) sull'apex `.it`, e la zona `.com` lo
risolve seguendo il redirect verso `.it`.

### E-E-A-T: contenuto YMYL firmato da un'organizzazione senza volto

`/guide` e `/help` parlano di sanzioni, aliquote IVA, regime forfettario e
obbligo POS: dalle Quality Rater Guidelines di settembre 2025 è **YMYL pieno**
(legale + finanziario), la categoria a cui Google applica l'asticella E-E-A-T
più alta. Il test "Who / How / Why" della guida sui contenuti helpful si
aspetta, per YMYL, una **byline con una pagina autore** che dica chi ha
scritto e con quale competenza, e la **disclosure del processo** quando il
lettore se la chiederebbe — per esempio su contenuto assistito da AI.

Stato attuale: `articleJsonLd` (`src/components/json-ld.tsx`) dichiara
`author: { "@type": "Organization", name: "Team ScontrinoZero" }`. Nessun
`Person`, nessuna bio, nessuna pagina autore, nessuna disclosure di metodo, su
~89 pagine di contenuto prodotto via LLM con revisione umana (la skill
`marketing-content` lo dichiara in chiaro). Il contrappeso E-E-A-T oggi vale
zero, e il volume ci colloca nella fascia che la policy sui contenuti scalati
guarda per prima.

**Rischio accettato**, deciso il 2026-08-27: non esporre una persona fisica su
un progetto hobby, e non aggiungere una disclosure che nessun competitor
italiano espone. Le pagine restano accurate e verificate su fonte primaria
(tabella dei riferimenti normativi nella skill), che è il pezzo di Trust che
conta di più.

**Riaprire se:** le impression di `/guide` o `/help` calano in modo sostenuto
su GSC senza una causa tecnica identificabile; oppure a un core update che
tocca visibilmente il traffico organico; oppure se il progetto smette di essere
one-man e una byline reale diventa disponibile a costo sociale zero. In quel
caso l'ordine giusto è: prima la disclosure di metodo (copre il "How" senza
esporre nessuno), poi eventualmente `Person` + pagina autore.

### SonarCloud non indicizza `src/app/.well-known/**`

Misurato sulla PR #881 via API SonarCloud, non dedotto:

```
$ curl -sS 'https://sonarcloud.io/api/measures/component?component=dstmrk_scontrinozero\
&pullRequest=881&metricKeys=new_lines,new_lines_to_cover'
new_lines = 7 · new_lines_to_cover = 0

$ curl -sS '…component=dstmrk_scontrinozero:src/app/.well-known/security.txt/route.ts&pullRequest=881…'
{"errors":[{"msg":"Component '…' of pull request '881' not found"}]}
```

Quella PR aggiungeva 160 righe di TypeScript; Sonar ne ha viste **7** (le
sole di `src/proxy.ts` e `src/proxy.test.ts`). I due file sotto la
dot-directory non esistono proprio come componenti. Conseguenza da tenere a
mente leggendo il gate: `0.0% Coverage on New Code` **passa** perché non ci
sono nuove righe da coprire, non perché la copertura sia a posto — e
qualunque cosa finisca sotto `.well-known/` è invisibile a bug, code smell,
security hotspot e coverage.

Il buco è solo lato Sonar: `coverage/lcov.info` contiene regolarmente
`SF:src/app/.well-known/security.txt/route.ts`, quindi
`npm run test:coverage` in locale e in CI copre il file per davvero.

**Non "risolvere" con `sonar.scanner.excludeHiddenFiles=false`.** La doc
Sonar dice che i file nascosti tracciati da Git sono già inclusi di default,
ma quella frase sta sulla pagina _Secrets_ e riguarda l'analisi dei segreti:
sull'analizzatore TS l'evidenza sopra dice il contrario. Aggiungere la
proprietà sarebbe un placebo che fa sembrare chiuso un buco aperto.

**Perché si accetta.** Sotto `/.well-known` ci vanno file statici e brevi per
definizione — `security.txt` oggi, al più `apple-app-site-association` o un
redirect `change-password` domani. Un gate cieco su una trentina di righe di
testo costante costa meno dell'indirezione che servirebbe a evitarlo.

**Riaprire** appena lì dentro entra logica non banale (rami, input utente,
chiamate esterne): a quel punto la route si sposta fuori dalla dot-directory
(`src/app/well-known/…`) e l'URL pubblico si ottiene con un rewrite in
`next.config.ts`, dove già vivono quelli di `/v1/:path*`. L'analisi Sonar
vale l'indirezione solo da quel momento in poi.

### audit-ci: advisory `esbuild` dev-only

`audit-ci.json` allowlista `GHSA-67mh-4wv8-2f99` (dev-server SSRF).
`esbuild` non è in `dependencies` prod: entra solo transitivamente via toolchain
dev (`drizzle-kit`/`tsx`/`@esbuild-kit/*`, tutte `devDependencies`), mai a runtime
né nella build Next (SWC). Superficie ≈ 0. **Riaprire:** quando la toolchain
aggiorna `esbuild` > 0.28.0 senza major rischioso → togliere l'allowlist.

### #57 verifica su AdE reale sostituita da sentinella Sentry

Il fix #57 (totali payload per-riga in cents) è spedito. Il sub-task A del
mapper (ex #88) ha poi allineato il payload alla semantica del portale —
`prezzoLordo` unitario, netti a piena precisione — su prova documentale (due
payload reali accettati dall'AdE, `HAR.md` voci #1 e #12), ma **entrambi a
quantità intera**: nessuna cattura copre una quantità frazionaria, e la
conferma richiederebbe di emettere su `ADE_MODE=real` uno scontrino a peso
(regole 13/14). Invece di bloccare il rollout su quella verifica manuale, si
accetta la strategia adottata — `ammontareComplessivo` e i lordi restano
cent-esatti, i netti derivano dal lordo di riga così che
`imponibileNetto + importoIVA = totale` regga anche sulle frazionarie — e si
delega il rilevamento a due sentinelle in `runSubmitSale`
(`src/lib/services/receipt-service.ts`):

1. **Invariante** — `sum(vendita[].importo) !== ammontareComplessivo` →
   `logger.error` "ade:payload_total_mismatch" (fingerprint
   `["emit-receipt","payload-total-mismatch"]`). Deterministica: non scatta mai
   se l'arrotondamento è corretto → zero rumore, guardia anti-regressione.
2. **Rifiuto AdE su quantità frazionaria** — `esito:false` con almeno una riga a
   `quantity` non intera → `logger.error` "ade:fractional_qty_rejected"
   (fingerprint `["emit-receipt","fractional-qty-rejected"]`, con `adeErrorCodes`
   nei log). I rifiuti su quantità intere restano `warn` (regola 20).

**Riaprire:** se una delle due sentinelle apre una issue Sentry — allora
l'assunzione sui totali va rivista, e il campione da chiedere è un rifiuto AdE
su riga a quantità frazionaria con aliquota IVA.

### #88 `flagIdentificativiModificati` diverge dal portale

`src/lib/ade/mapper.ts` manda `flagIdentificativiModificati: true` (e
`altriDatiIdentificativi.modificati: true`), il portale manda `false` su
entrambi. L'AdE **accetta entrambi** — la produzione funziona da sempre — ed è
l'unica delle sei divergenze della voce #11 di `HAR.md` rimasta aperta dopo il
sub-task A: le altre cinque sono chiuse. Il `true` è deliberato e coerente,
segnala all'AdE che stiamo inviando dati di identificazione nostri invece di
quelli memorizzati sul portale. Registrato per non ri-scoprirlo a ogni audit del
mapper. **Riaprire:** se l'AdE iniziasse a rifiutare o a trattare diversamente i
documenti con il flag a `true`.

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
