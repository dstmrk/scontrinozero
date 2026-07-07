# REVIEW.md — Registro bug noti e tech debt

> **Data ultimo audit:** 2026-07-07 (incrementale, PR #695) · **Versione analizzata:** main (commit `8d72f9c`)
>
> **Audit incrementale 2026-07-07 (PR #695 — onboarding multi-metodo CIE):**
> code review approfondita del diff `449772d..d9262b0` su cinque assi (sicurezza ·
> performance · funzionalità · architettura · bad practices): flusso CIE in
> `real-client.ts`, store sessioni interattive, ramificazioni emit/void
> `reauthRequired`, migrazione 0027, rotazione chiavi, server action
> method-aware, UI onboarding/settings/cassa/annullo, API v1. Nuovi finding:
> #42 (P1) · #43–#47 (P2) · #48–#55 (P3). Falsi positivi scartati con verifica
> manuale: TOCTOU pre-check/in-flight della sessione CIE (gestito: catch di
> `AdeReauthRequiredError` dentro emit/void), deposito nello store di una
> sessione con identity guard fallita (innocuo: `fetchAdePrerequisites` richiede
> `verifiedAt`), 401 con `credentials=null` (corretto: `AdeSessionExpiredError`
> → reauth), rotazione chiavi su campi nullable (corretta), migrazione 0027
> non idempotente (falso: `DROP NOT NULL` e guard su `pg_constraint` sono
> re-run safe), credenziali CIE nei log (assenti: solo `bodyLen`),
> serializzazione per-business dello store (corretta, chain con guard).
>
> **Audit incrementale 2026-07-07:** code review mirata sul flusso GDPR di
> cancellazione automatica utenti inattivi (`inactive-user-prune` + config +
> sweep + `purge-user`), con verifica manuale fino a middleware/proxy e
> semantica `last_sign_in_at` di Supabase. Due bug fixati contestualmente
> (stesso PR): segnale di attività cieco alle visite autenticate con sessione
> persistente (colonna `last_seen_at` + touch in `getAuthenticatedUser`) e
> `purgeUserById` non idempotente su profilo orfano (retry infinito + dati mai
> cancellati). Nuovi finding: #39, #40, #41 (P3). Falsi positivi scartati
> (ordine email→flag del preavviso, RESET prima del DELETE, fail-safe su plan
> sconosciuto/pagato-null, cast `db.execute` con postgres-js, data promessa
> nell'email mai successiva alla cancellazione reale).
>
> **Audit incrementale 2026-06-27:** code review mirata sui percorsi critici
> (registrazione/accesso/onboarding · emissione/annullo scontrini · billing/
> Stripe-webhook), con verifica manuale di ogni finding sul codice corrente.
> Nuovi finding: #38 (P2) — #35 (mark `ERROR` su AdE transient), #36
> (rate limit `verifyAdeCredentials`) e #37 (normalizzazione allowlist hostname
> Turnstile) risolti. Falsi positivi/duplicati scartati
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

### 42. Privacy Policy e Termini non coprono le credenziali CIE ID (feature live)

- **Categoria:** compliance/GDPR · **Severità:** High — la feature è live in produzione e raccoglie una categoria di credenziali non dichiarata
- **File:** `src/app/(marketing)/privacy/v01/page.tsx:104-109` (§2.3 nomina solo "Credenziali Fisconline"), `:236-296` (§5 "Trattamento speciale delle credenziali **Fisconline**"), `:409-419` (retention "Credenziali Fisconline"); `src/app/(marketing)/termini/v01/page.tsx:87` e `:117-121` (§5 "Credenziali Fisconline"); procedura di aggiornamento documentata in `CLAUDE.md` → "Procedura aggiornamento T&C"

**Problema.** La PR #695 introduce la memorizzazione cifrata di **email +
password dell'app CIE ID** (`buildCieValues` in
`src/server/onboarding-actions.ts:331`, colonna `encrypted_username` della
migrazione 0027). È una nuova categoria di credenziali di un servizio terzo
(IdP del Ministero dell'Interno), ma Privacy Policy e Termini enumerano
esclusivamente le credenziali Fisconline: l'informativa (art. 13 GDPR) non
copre il nuovo trattamento e il §5 dei Termini ("Credenziali Fisconline")
non disciplina le credenziali CIE ID. Il TODO copy era dichiarato nella PR
("aggiornare il copy marketing, rinviato") ma i documenti legali sono più
urgenti del marketing.

**Fix (non ambiguo).**

1. **Privacy v02** seguendo la procedura documentata (nuova route
   `privacy/v02/page.tsx`, redirect, `sitemap.ts` + `sitemap.test.ts`,
   `sonar.coverage.exclusions`): generalizzare §2.3, §5 e la sezione retention
   da "credenziali Fisconline" a "credenziali di accesso ai servizi AdE
   (Fisconline oppure CIE ID)", esplicitando per CIE: email e password
   dell'app CIE ID cifrate AES-256-GCM, sessione mantenuta in memoria del
   server, secondo fattore (notifica push) mai gestito/memorizzato.
2. **Termini v02** seguendo la procedura (route, redirect in
   `termini/page.tsx`, `CURRENT_TERMS_VERSION` in `auth-actions.ts`, secondo
   flag art. 1341 c.c. in `register/page.tsx` con i nuovi numeri di
   paragrafo): §3 requisiti e §5 estesi al metodo CIE.
3. Notifica agli utenti ≥15 giorni prima dell'entrata in vigore (procedura
   documentata).
4. **Test:** quelli previsti dalla procedura (sitemap, redirect); grep
   `Fisconline` sulle nuove versioni per verificare che ogni occorrenza
   residua sia intenzionale.

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

### 43. Flusso CIE: form action POSTate senza validazione allowlist (SAMLResponse esfiltrabile)

- **Categoria:** sicurezza · **Severità:** Medium — stesso pattern del finding #28 (SPID), ma qui il flusso è **live**
- **File:** `src/lib/ade/real-client.ts:1265` (`cieFetchSamlRequest`: `ssoUrl` da `parseFormAction` dell'HTML del SP AdE), `:1293` (`ciePostSamlRequest` POSTa a `ssoUrl` senza check), `:1463-1495` (`ciePostFinalProbe`: `formAction` da `parseFormAction` dell'HTML IdP), `:1507` (`cieSubmitSamlResponse` POSTa la `SAMLResponse` a `formAction` senza check)

**Problema.** La PR #695 ha introdotto `FEDERATED_ALLOWED_HOSTS` e la valida
correttamente su **tutti** gli header `Location` (via `resolveAdeRedirect`),
ma le **form action estratte dall'HTML** con `parseFormAction` vengono usate
come target di POST senza alcuna validazione: (a) `ssoUrl` dalla pagina del SP
AdE riceve la `SAMLRequest`; (b) `formAction` dalla pagina finale dell'IdP
riceve la **`SAMLResponse`**, che contiene l'asserzione d'identità dell'utente
(nome, cognome, data di nascita, codice fiscale — gli attributi del consenso
e1s4). Se l'HTML del SP/IdP fosse manomesso o servito in modo anomalo, quei
dati verrebbero POSTati verso un host arbitrario. Le credenziali CIE non sono
a rischio (`ciePostCredentials` usa l'URL hardcoded `CIE_IDP_BASE_URL`), e il
TLS verso AdE/IdP mitiga in pratica — stessa classe di rischio del finding
#28, che però copre solo il flusso SPID (non cablato).

**Fix (non ambiguo).**

1. Validare **ogni** output di `parseFormAction` nel flusso CIE contro
   `FEDERATED_ALLOWED_HOSTS` prima del POST: riusare
   `resolveAdeRedirect(currentPageUrl, action, FEDERATED_ALLOWED_HOSTS)`
   (risolve anche i path relativi) sui tre punti: `ssoUrl` (`:1265`),
   `formAction` (`:1480`, incluso il caso in cui vince il fallback ACS) e
   verifica che l'unico punto già validato (`iampeAction`, `:1522`) resti
   invariato.
2. Errore esplicito (`AdePortalError`), mai degradare al fallback se l'action
   parsata è fuori allowlist.
3. **Test** (in `real-client-cie.test.ts`): form action verso host fuori
   allowlist → throw senza che il POST parta; action relativa → risolta e
   accettata; flusso HAR-conforme → invariato.
4. Il finding #28 resta aperto per SPID: applicargli lo stesso helper quando
   `loginSpid` verrà cablato.

---

### 44. Messaggi d'errore AdE non method-aware: utenti CIE vedono copy Fisconline/SPID

- **Categoria:** funzionalità/UX · **Severità:** Medium — colpisce il caso d'errore più comune (credenziali sbagliate) del nuovo onboarding CIE
- **File:** `src/lib/ade/error-messages.ts:34-39` (`AdeAuthError` → "Credenziali Fisconline non valide. Verifica codice fiscale, password e PIN.") e `:52-56` (`AdeSpidTimeoutError` → "Non hai approvato la richiesta SPID in tempo."); caller: `attemptAdeLoginForVerification` in `src/server/onboarding-actions.ts`
- **Da affrontare INSIEME a #45 e #46** (stesso intervento: "il rinnovo/verifica sessione CIE funziona per un utente reale" — stessi file, stesso copy, da chiudere prima della validazione su AdE reale)

**Problema.** `ciePostCredentials` lancia `AdeAuthError` su credenziali CIE
errate e `ciePollAndProceed` lancia `AdeSpidTimeoutError` su push non
approvata, ma `getUserFacingAdeErrorMessage` intercetta queste classi PRIMA
del fallback method-aware (`defaultMessage` di `buildVerificationLogin`):
un utente CIE che sbaglia la password vede "Credenziali **Fisconline** non
valide. Verifica **codice fiscale, password e PIN**" (campi che non ha mai
inserito), e chi non approva la notifica vede "richiesta **SPID**". Messaggi
attivamente fuorvianti nel flusso di lancio della feature.

**Fix (non ambiguo).**

1. Aggiungere un parametro `method?: AdeLoginMethod` a
   `getUserFacingAdeErrorMessage`; per `method === "cie"`:
   `AdeAuthError` → "Credenziali CIE ID non valide. Verifica email e
   password."; `AdeSpidTimeoutError` → "Non hai approvato la notifica
   sull'app CIE ID in tempo. Riprova.". Default (undefined/fisconline):
   messaggi attuali, così i call-site emit/void Fisconline restano invariati.
2. Passare il method dai call-site della verifica
   (`attemptAdeLoginForVerification` riceve già `opts` — aggiungere il
   method accanto a `flow`/`defaultMessage`).
3. **Test:** `AdeAuthError` + method cie → messaggio CIE;
   `AdeSpidTimeoutError` + method cie → messaggio notifica CIE ID; senza
   method → messaggi storici invariati (snapshot).

---

### 45. Verifica CIE: finestra push (fino a 210s) oltre il timeout proxy Cloudflare (~100s)

- **Categoria:** funzionalità/architettura · **Severità:** Medium — la verifica può riuscire server-side mentre il client vede un errore
- **File:** `src/lib/ade/real-client.ts:1385-1386` (`ciePollAndProceed`: `spidMaxPolls ?? 30` × `spidPollIntervalMs ?? 7000` = 210s); `src/lib/ade/index.ts` (`createAdeClient` istanzia `new RealAdeClient()` senza opzioni); deploy dietro Cloudflare Tunnel (CLAUDE.md)
- **Da affrontare INSIEME a #44 e #46** (il copy d'attesa del punto 2 vive nei componenti toccati da #46; il messaggio di timeout è quello reso method-aware da #44)

**Problema.** `verifyAdeCredentials` per CIE è una server action sincrona che
attende l'approvazione push fino a 30 poll × 7s = **210 secondi** (+ le fasi
SAML). Prod/sandbox/dev stanno dietro Cloudflare (Tunnel/proxy), che chiude
le response HTTP dopo ~100s (error 524): se l'utente approva la notifica dopo
il taglio, il client riceve un errore di rete ma il server **completa
comunque** la verifica (sessione depositata nello store, `verifiedAt`
settato) → l'utente vede "verifica fallita", riprova, consuma il rate limit
(5/15min) e riceve una seconda push, con stato UI incoerente rispetto al DB.

**Fix (non ambiguo).**

1. Opzioni dedicate `cieMaxPolls`/`ciePollIntervalMs` in
   `RealAdeClientOptions` con default **12 × 7000ms = 84s** (sotto il taglio
   Cloudflare con margine per le fasi SAML), usate da `ciePollAndProceed` al
   posto delle opzioni SPID; SPID (non cablato) resta a 30×7s.
2. Aggiornare il copy d'attesa dell'onboarding/settings: "Approva la notifica
   entro un minuto" e, su `AdeSpidTimeoutError`, invito esplicito a riprovare.
3. Registrare le soglie in `docs/architecture/config-manifest.md` (vedi #51).
4. **Test:** con fake timers, 12 poll senza cambio body → `AdeSpidTimeoutError`
   dopo ~84s; approvazione al poll N<12 → flusso completa.
5. (Opzionale, non richiesto ora) valutare un flusso asincrono client-driven
   (start login + poll di stato via action separata) se il taglio a 84s
   genererà troppi timeout reali — decidere con i dati del primo rollout.

---

### 46. "Verifica connessione" in settings non guida l'utente CIE (rinnovo sessione cieco)

- **Categoria:** funzionalità/UX · **Severità:** Medium — è il target del link "Ricollega ora" mostrato da cassa/annullo su `reauthRequired`
- **File:** `src/components/settings/ade-credentials-section.tsx` (componente intero, non method-aware); il server component `src/app/dashboard/settings/page.tsx:105-118` legge già `cred.loginMethod` ma lo passa solo a `EditAdeCredentialsSection`
- **Da affrontare INSIEME a #44 e #45** (il copy "approva entro un minuto" del punto 2 dipende dalla finestra push scelta in #45; i messaggi d'errore mostrati qui sono quelli di #44)

**Problema.** Il rinnovo della sessione CIE (dopo `reauthRequired` in
cassa/annullo, o dopo un restart del container) passa dal bottone "Verifica
connessione" nelle impostazioni. Ma il componente è rimasto Fisconline-only:
nessuna indicazione che per CIE va **approvata la notifica sull'app CIE ID**
(l'onboarding ha il copy dedicato, le impostazioni no), e durante l'attesa
(fino a minuti, vedi #45) mostra solo "Verifica in corso…". Un utente che
arriva da "Ricollega ora" non sa cosa deve fare e la verifica va
sistematicamente in timeout se non guarda il telefono.

**Fix (non ambiguo).**

1. Aggiungere prop `loginMethod: AdeLoginMethod` a `AdeCredentialsSection`,
   valorizzata da `settings/page.tsx` (il dato è già nella SELECT).
2. Per `loginMethod === "cie"`: (a) sotto il bottone, testo permanente
   "Il collegamento richiede l'approvazione di una notifica sull'app CIE ID";
   (b) in stato `pending`, messaggio attivo "Approva ora la notifica
   sull'app CIE ID sul tuo telefono…"; (c) label bottone "Collega" /
   "Ricollega" al posto di "Verifica connessione".
3. Nessun cambiamento per Fisconline (snapshot copy invariata).
4. **Test** (component test come `edit-ade-credentials-section.test.tsx`):
   method cie → copy push presente in idle e pending; method fisconline →
   copy attuale.

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

> **Aggiornamento 2026-07-07 (PR #695):** l'allowlist `FEDERATED_ALLOWED_HOSTS`
> ora esiste e copre i redirect (`Location`) del flusso federato, ma le **form
> action** restano non validate anche nel flusso **CIE, che è live**: vedi
> finding **#43** (P2). Il fix di #43 introduce l'helper da riusare qui quando
> `loginSpid` verrà cablato.

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

### 48. Reauth CIE in-flight: la riga SALE resta PENDING per sempre (ghost in storico)

- **Categoria:** correttezza/UX · **Severità:** Low — richiede la finestra rara "sessione viva al pre-check, rifiutata da AdE durante il submit"
- **File:** `src/lib/services/receipt-service.ts:676-683` (catch `AdeReauthRequiredError`: ritorna `reauthRequired` lasciando la riga PENDING); `src/components/storico/storico-client.tsx:41-69` (`StatusBadge`: PENDING cade nel fallback che mostra il raw `{status}` inglese); `src/lib/services/void-service.ts:794-800` (gemello VOID)

**Problema.** Quando la sessione CIE viene rifiutata da AdE **durante** il
submit (dopo l'INSERT del documento), il servizio ritorna `reauthRequired`
lasciando la riga `PENDING`. La cassa però genera una `idempotencyKey` nuova
a ogni submit (`cassa-client.tsx:191`): il retry post-ricollegamento crea un
documento nuovo e la riga orfana non viene mai più toccata — resta un ghost
"PENDING" perpetuo nello storico (mostrato oltretutto col literal inglese
`PENDING` su badge giallo). Il 401 AdE garantisce che il documento NON è
stato registrato (stessa assunzione già codificata nel commento del catch),
quindi non c'è rischio fiscale — solo sporcizia dati e confusione utente.
Il gemello VOID è meno grave: `insertOrResolveVoid` riaggancia la riga VOID
esistente al retry sullo stesso documento.

**Fix (non ambiguo).**

1. Nel catch `AdeReauthRequiredError` di `submitSaleToAde`, prima del
   `return { reauthRequired: true }`, marcare il documento `ERROR` con lo
   stesso UPDATE best-effort del ramo non-transient (righe ~705-717): è
   sicuro perché 401 ⇒ non registrato (in contrasto con i transient, dove
   l'esito è ignoto e PENDING è obbligatorio). La riga esce dal partial
   unique index → un retry API v1 con la stessa key re-inserisce e
   ri-sottomette da zero, senza duplicato.
2. Per `void-service`: verificare che con la riga VOID marcata `ERROR` il
   retry via `insertOrResolveVoid` re-inserisca correttamente; se sì,
   applicare lo stesso mark, altrimenti lasciare PENDING e documentare il
   perché nel commento.
3. Cosmetico contestuale: aggiungere il caso `PENDING` → "In corso" a
   `StatusBadge` (oggi mostra il raw inglese).
4. **Test:** reauth in-flight → riga `ERROR` + `reauthRequired: true`;
   retry con stessa key dopo mark → nuova emissione OK; transient → resta
   PENDING (invariato, REVIEW #35).

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
3. `config-manifest.md`: `DEFAULT_TTL_MS` (6h), `DEFAULT_MAX_ENTRIES` (100),
   `spidMaxPolls`/`spidPollIntervalMs` (30/7000 — o i nuovi valori se il
   finding #45 è stato fatto prima), `FEDERATED_ALLOWED_HOSTS` → puntatori a
   `interactive-session-store.ts` e `real-client.ts`.
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

### 54. Banner reauth CIE in cassa illeggibile in dark mode

- **Categoria:** UI/accessibilità · **Severità:** Low
- **File:** `src/components/cassa/cassa-client.tsx:313-330` (banner `reauthRequired`: `border-amber-200 bg-amber-50` **senza colore testo** né varianti `dark:`); `src/components/storico/void-receipt-dialog.tsx:157-162` (ha `text-amber-800` ma nessuna variante `dark:`)

**Problema.** Il dashboard usa `next-themes` con `defaultTheme="system"`
(`src/app/dashboard/layout.tsx:49`): in dark mode il testo del banner cassa
eredita il foreground chiaro del tema su fondo `amber-50` chiaro → contrasto
quasi nullo proprio sul messaggio che spiega come sbloccare l'emissione. Il
banner del dialog annullo resta leggibile (amber-800 su amber-50) ma è un
blocco chiaro incoerente col tema scuro.

**Fix (non ambiguo).**

1. Cassa: `rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200`.
2. Dialog annullo: aggiungere le stesse varianti `dark:` (`dark:bg-amber-950 dark:text-amber-200`).
3. Ordinamento classi Tailwind via `npx prettier --write` (skill
   `react-patterns`).
4. Verifica visiva in entrambi i temi (nota: il banner rosso `mutationError`
   adiacente usa `bg-red-50` + `text-destructive`, anch'esso senza `dark:` —
   pre-esistente; allinearlo nello stesso PR è benvenuto ma opzionale).

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

## Rischi accettati (documentati, non da fixare)

Scelte consapevoli con un trigger di riapertura. Non sono finding da pianificare.

### audit-ci: 3 advisory `esbuild` dev-only

`audit-ci.json` allowlista `GHSA-67mh-4wv8-2f99` (dev-server SSRF),
`GHSA-gv7w-rqvm-qjhr` (Deno RCE), `GHSA-g7r4-m6w7-qqqr` (file-read Windows).
`esbuild` non è in `dependencies` prod: entra solo transitivamente via toolchain
dev (`drizzle-kit`/`tsx`/`@esbuild-kit/*`, tutte `devDependencies`), mai a runtime
né nella build Next (SWC). Superficie ≈ 0. **Riaprire:** quando la toolchain
aggiorna `esbuild` > 0.28.0 senza major rischioso → togliere l'allowlist.

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
