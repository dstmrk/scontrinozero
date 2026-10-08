---
name: ade-integration
description: Use when working with the Agenzia delle Entrate (AdE) "Documento Commerciale Online" integration — editing files under src/lib/ade/ or the emit/void/recovery orchestration in src/lib/services/, handling Fisconline credential encryption/decryption, rotating ENCRYPTION_KEY via scripts/rotate-encryption-key.ts, working on the CIE login branch (loginCie federated SAML flow, push polling, the interactive session store in src/lib/ade/interactive-session-store.ts shared by CIE and adopted SPID sessions, isInteractiveSessionMissing pre-check and the reauthRequired outcome), reverse-engineering AdE HTTP flows from HAR captures (login_cie.har, ricerca.har, etc. — local-only, gitignored), wiring the RealAdeClient/MockAdeClient adapter for ADE_MODE=real|mock, tuning the stale-pending recovery (getStalePendingThresholdMs, reconcileSaleDocument/reconcileVoidDocument in src/lib/services/ade-recovery.ts), or debugging production AdE 4xx/5xx errors. Covers why no headless browser is allowed and the diagnostic-logging-first debug pattern.
---

# ade-integration — Integrazione Agenzia delle Entrate, mock, debug

## Strategia: integrazione diretta (no API REST, no headless browser)

L'AdE **non espone API REST pubbliche**. La procedura "Documento Commerciale
Online" è un'interfaccia web nel portale Fatture e Corrispettivi.

Approccio:

- Reverse-engineering delle chiamate HTTP che il portale AdE effettua internamente
- L'utente collega il proprio accesso AdE con **Fisconline** (credenziali cifrate,
  mai in chiaro) oppure con **CIE** (login federato + conferma push): due rami
  con semantiche di sessione diverse — vedi la sezione dedicata sotto
- Il backend replica il flusso con chiamate HTTP dirette (fetch/axios)
- **NO Playwright/headless browser** — troppo pesante per VPS limitata
  (~400MB RAM per Chromium). Solo HTTP leggero.

### Tre invarianti che l'integrazione non può rompere

La risposta a interpello AdE **n. 413 del 25 settembre 2020** fissa le
condizioni per i software che automatizzano la procedura web. Tradotte in
vincoli di design, sono quelle che il codice già rispetta — e che una
"ottimizzazione" futura romperebbe senza accorgersene:

1. **Un solo adempimento contestuale.** Memorizzazione, emissione del
   documento e trasmissione non sono separabili. Il documento nasce `PENDING`
   e diventa valido **solo** con `adeTransactionId` + `adeProgressive`
   restituiti dall'AdE: l'optimistic UI è presentazione, mai anticipo
   dell'adempimento.
2. **Nessun colloquio automatizzato con l'AdE fuori da una richiesta utente.**
   La stale-recovery è **pull-based** — il suo unico ingresso è il ramo di
   collisione sull'idempotency key, cioè un'azione dell'esercente in sessione
   — e `src/lib/services/pending-verification.ts` **verifica senza
   ri-sottomettere** (un "nessun match" porta a `ERROR` e all'invito a
   riemettere, mai a un nuovo `submitSale`). Uno sweep in background in `src/instrumentation.ts` che
   parli con l'AdE romperebbe questo invariante **e** il precedente: è il
   motivo per cui non esiste, oltre al fatto che fuori da una richiesta utente
   non c'è sessione AdE né chi sappia se la vendita è avvenuta davvero.
3. **Nessuna alterazione** dei dati trasmessi né di quanto l'AdE genera in
   risposta. Il progressivo e l'esito sono sempre quelli dell'Agenzia.

---

## Pattern adapter/strategy per ambiente sandbox

L'integrazione AdE usa `AdeClient` con due implementazioni:

- **`RealAdeClient`** — invia davvero all'AdE (produzione)
- **`MockAdeClient`** — esegue **tutta la logica** (validazione, formattazione,
  preparazione payload) ma si ferma prima dell'invio HTTP, restituendo una
  risposta simulata

Controllato da `ADE_MODE=real|mock` (env var). Il codice in sandbox è
**identico** a quello in produzione, cambia solo l'ultimo step.

---

## Due metodi d'accesso: Fisconline vs CIE (entrambi live)

`ade_credentials.login_method` (`'fisconline' | 'cie'`, migrazione `0027`)
discrimina i due rami. **Non sono simmetrici**, e la differenza non è nel login
ma in **chi può ri-crearlo**:

|                 | **Fisconline**                          | **CIE**                                    |
| --------------- | --------------------------------------- | ------------------------------------------ |
| Segreto         | username + password + PIN cifrati in DB | nessun segreto riusabile lato server       |
| Secondo fattore | nessuno                                 | conferma **push** sull'app CIE ID (umano)  |
| Riuso sessione  | `src/lib/ade/session-cache.ts`          | `src/lib/ade/interactive-session-store.ts` |
| Rinnovo su 401  | **silenzioso** (ri-login col segreto)   | **impossibile** → `AdeReauthRequiredError` |

Entrambi passano da `withAdeSession` (`src/lib/ade/index.ts`), che sceglie lo
store in base a `method`. In `ADE_MODE=mock` non c'è cache: `login`/`loginCie` +
`logout` per operazione, così anche CIE dà un OK immediato in dev/sandbox.

**Regole quando tocchi il ramo CIE:**

1. **Pre-check prima di scrivere il documento.** `isInteractiveSessionMissing(businessId, method)`
   (CIE e SPID; il chiamante esclude Fisconline, che si ri-logga da solo)
   va chiamato **prima** dell'INSERT del PENDING in emissione/annullo: senza, un
   business da ri-collegare si ritrova un documento PENDING bloccato dallo
   stale-gate dei 30 min anche dopo aver rinnovato. Esito user-facing:
   `{ reauthRequired: method }` (`"cie"` o `"spid"`, dal pre-check o da
   `AdeReauthRequiredError.method`) → `AdeReauthBanner` in UI, **409** sulla
   Developer API. Il metodo serve al banner: a un utente SPID va chiesto un
   nuovo login SPID dall'app (`SpidConnectButton`), non la notifica CIE, e
   nel browser non c'è niente da premere, solo il rimando all'app.
2. **Il TTL dello store NON è la scadenza della sessione AdE.** `DEFAULT_TTL_MS`
   (6h) e `DEFAULT_MAX_ENTRIES` (100, LRU per-business) sono un cap di memoria:
   la scadenza vera la dichiara AdE → `AdeSessionExpiredError` → tradotto in
   `AdeReauthRequiredError`. Non inventare una scadenza logica lato nostro, e
   non "riprovare" un login CIE dal server: il secondo fattore è umano.
   **L'AdE però non la dichiara solo col 401.** Misurato in produzione
   (SCONTRINOZERO-M, 12/09/2026): sessione CIE creata alle 12:15, `submitSale`
   alle 16:36 → **`405` con `text/html` e body vuoto**, non un 401. Il client si
   credeva loggato (`assertLoggedIn` guarda solo `this.session`), la riga è
   finita in ERROR e l'utente ha visto un errore generico; 24 secondi dopo si è
   ri-collegato da solo e i tre scontrini successivi sono passati.
   `isSessionNotActive` (`real-client.ts`) copre ora entrambe le firme: **401**,
   oppure **4xx il cui body non è JSON** — l'API REST del DCO risponde JSON su
   ogni esito, rifiuti compresi, quindi un 4xx non-JSON viene da un gateway
   davanti all'app e la POST non ha mai raggiunto l'handler.
   Tre cose da non sbagliare se ci torni sopra:
   - **Il discriminante è il body, non il `Content-Type`.** Stesso criterio del
     ramo `AdeUnknownOutcomeError` un blocco più sotto, e un header assente su un
     rifiuto vero manderebbe l'utente in una re-auth inutile. Si fa uno **sniff**
     del primo carattere (`{` o `[`), non un `JSON.parse`: l'estratto è troncato
     a 2048 char e un body JSON più lungo fallirebbe il parse.
   - **I 5xx restano fuori**, anche con pagina HTML di manutenzione: sono già
     transient (riga PENDING + riconciliazione), e degradarli a "ri-collegati"
     perde quella semantica.
   - **Il ramo logga `ade:submit_session_not_active`** perché consuma la response
     e `ade:submit_failed` non viene mai raggiunto: senza quel log il caso
     sparisce dai radar.
3. **Store in-process, single container** (coerente con l'architettura): un
   deploy/restart perde le sessioni interattive e l'utente ri-collega. È
   accettato, non un bug — ma va ricordato quando si valuta lo scaling.
4. **Redirect federati solo dentro l'allowlist.** Il flusso SAML CIE segue
   redirect verso host IdP: passano tutti da `resolveAdeRedirect` contro
   `FEDERATED_ALLOWED_HOSTS` (`src/lib/ade/real-client.ts`). Un host nuovo va
   aggiunto **esplicitamente** all'allowlist, mai seguito perché "arriva da AdE"
   (anti open-redirect).
5. **Finestra di polling push:** 12 × 7000 ms ≈ 84 s (`cieMaxPolls` /
   `ciePollIntervalMs`), scelta per stare **sotto** il taglio ~100 s del proxy
   Cloudflare (errore 524). Se allunghi l'attesa, il gate reale è quello, non AdE.
   SPID non ha più un flusso server: il login avviene nella webview dell'app
   nativa e il server adotta i cookie (sezione "Sessione adottata" sotto).
   `AdeSpidTimeoutError` resta, ma lo lancia solo questo polling CIE.
6. **Un rifiuto a livello2 non è per forza "credenziali sbagliate".** Il
   rilevamento KO scatta sul testo "Credenziali non valide" **oppure** sulla
   sola classe `form-control … error`. Il 28/09/2026 le stesse credenziali
   salvate sono passate alle 11:31 e sono state rifiutate alle 11:43, dopo una
   push scaduta. Per questo `ade:cie_credentials_rejected` porta `marker`
   (`ko_text` | `error_class`) e `idpMessage`/`pageTitle` estratti da
   `src/lib/ade/cie-idp-page.ts`. Prima di toccare il rilevatore, leggi quei
   campi su Sentry Logs (`message:ade:cie_credentials_rejected`): un
   `error_class` con un `idpMessage` diverso è il caso da gestire. Mai loggare
   l'HTML grezzo: al re-render l'IdP ricompila l'email nel `value` dell'input.
7. **Nello store entra solo una verifica riuscita.** `runAdeVerification`
   deposita il client (CIE o SPID, solo `ADE_MODE=real`) dopo
   `finalizeVerifiedIdentity` con esito `success`, mai prima. Un deposito
   anticipato lascia nello store una sessione di un'altra P.IVA (identity
   guard fallito) o di una verifica non salvata, e su un rinnovo con
   `verifiedAt` già valorizzato l'emissione la userebbe (issue #1040). Una
   verifica fallita lascia cadere il client senza logout. Si guarda
   `outcome`, non l'assenza di `error`: `credentials_changed` non ha errore
   ma non ha salvato niente. Fisconline, e ogni metodo in `ADE_MODE=mock`,
   fanno logout subito. Gate: i test «sessione nello store interattivo
   (ADE_MODE=real)» in `src/server/onboarding-actions.test.ts`, uno per
   ciascuna di queste condizioni.

Il socket keep-alive morto (sezione sotto) colpisce **soprattutto qui**: i gap
di 7 s tra un poll e l'altro superano il keep-alive dei server IdP.

---

### Sessione adottata (SPID via webview, v2.0 — lato server cablato)

Un terzo modo di avere un client autenticato: non fare login, ma **adottare**
i cookie di una sessione aperta altrove. È il contratto dell'app nativa
(`docs/mobile-v2.md` punto 5): la webview fa il login SPID, il server emette.
`RealAdeClient.adoptSession(cookieHeader)` carica l'header `Cookie` nel jar
(`CookieJar.loadHeader`) e lo verifica leggendo la P.IVA da `dati/fiscali`.

- **La sessione del portale non è legata all'IP.** Misurato il 24/09/2026:
  cookie da un browser a casa, GET da un container cloud → 200. È ciò che
  rende possibile il design; se un giorno smette di valere, è lì che si
  rompe.
- **Il redirect su `dati/fiscali` non si segue** (`followRedirects: false`):
  cookie non validi portano al login, che seguito risponderebbe 200 con HTML.
  401 o 3xx → `AdeSessionExpiredError`.
- **Il collegamento passa da `connectAdeWithSpid`** (`src/server/onboarding-actions.ts`):
  riga `ade_credentials` con `login_method = 'spid'` e nessun segreto, poi la
  stessa verifica di Fisconline e CIE (`verifyStoredCredentials`) con
  `adoptSession` al posto del login, identity guard compreso. La sessione
  finisce nello store interattivo come CIE. **Si adotta e si controlla
  l'identità prima di scrivere** (issue #1040): `adoptSession` gira su un
  client nuovo e restituisce i dati fiscali che ha letto da `dati/fiscali`;
  l'identity guard li confronta con la P.IVA registrata, e solo allora parte
  l'upsert. Client e dati passano poi alla verifica, che non rifà la GET. Un
  upsert prima di uno dei due controlli cancellerebbe le credenziali
  Fisconline di chi già emette: con cookie scaduti, o scegliendo nel portale
  un'utenza di un'altra P.IVA (chi ne ha più d'una). `verifyAdeCredentials` su una riga
  `spid` senza cookie non ha niente da adottare: risponde di ricollegarsi
  dall'app.
- **Nessuna credenziale in memoria**: su 401 in emissione niente re-login,
  `AdeSessionExpiredError` come per CIE. `adoptSession` azzera anche
  credenziali e sessione di un login precedente sullo stesso client.
- **Il logout di un client adottato non chiama l'AdE** (issue #1042): la
  sessione l'ha aperta il login SPID dell'utente, non il server, che la
  lascia solo cadere dalla memoria. Resta valida sull'AdE fino alla sua
  scadenza, ma nessuno ne tiene i cookie: il telefono li cancella dopo la
  cattura (#1041). Se quella pulizia fallisce (warning
  `flow:spid-capture`) un ricollegamento può ricatturarli, e un logout IAM
  del client vecchio chiuderebbe anche la sessione nuova. Gate: i test
  «sessione adottata (issue #1042)» in `src/lib/ade/real-client.test.ts` e
  «dopo un'adozione sullo stesso client» in
  `src/lib/ade/real-client-cie.test.ts`.
- **L'emissione chiede solo i cookie.** Misurato con
  `scripts/adopt-session-probe.ts --emit`: vendita e annullo da €0,01
  accettati con la sola sessione adottata, senza `x-appl` né `setUserChoice`
  da rifare. Lo script resta il probe da rilanciare se l'AdE cambia
  qualcosa nel login (lettura di default, `--emit` per emettere e
  annullare).
- **La cattura sta in `src/lib/native/spid-capture.ts`**, nel bundle web:
  l'app è un guscio su `server.url`, quindi il codice che parla al plugin
  InAppBrowser arriva dal server e usa il bridge `window.Capacitor`
  (`nativePromise`/`addListener` sul plugin `CapgoInAppBrowser`), senza
  `@capacitor/core` fra le dipendenze web. Il segnale di login riuscito è
  l'arrivo della webview su Documento commerciale online: è lì che si leggono
  i cookie di `ivaservizi` (`includeHttpOnly`). URL di partenza e prefisso
  vanno verificati sul device: se l'AdE li sposta, è la prima cosa da
  guardare.
- **Letti i cookie, li si cancella dal telefono** (issue #1041,
  `src/lib/native/ade-cookie-cleanup.ts`). Il plugin li tiene dopo la
  chiusura, e il bridge li dà a qualunque script dell'origine dell'app,
  HttpOnly compresi: un XSS diventerebbe una sessione AdE usabile da
  qualunque IP. I due plugin non fanno quello che il nome promette, e la
  lezione è leggerne il sorgente nativo in `mobile/node_modules` prima di
  usare un metodo:
  - **iOS**: `clearCookies({url})` del plugin cancella per suffisso di
    dominio, sul data store del browser aperto. Su iOS 17+ è uno store
    dedicato (UUID fisso), su iOS 15/16 è il `default()` dell'app, e a
    browser chiuso il plugin rifiuta: si chiama **prima** di `close`. Per
    questo il browser si apre con `closeAction: "hide"`: la X della
    toolbar lo nasconde (`hideEvent`) invece di chiuderlo, e chi rinuncia
    dopo il login passa anche lui da pulizia e poi `close`.
    `clearAllCookies` e `clearCookiesOnOpen` su iOS 15/16 sloggano
    l'utente da ScontrinoZero. L'observer con cui Capacitor copierebbe i
    cookie WebKit in `HTTPCookieStorage.shared` non è trattenuto da
    nessuno (`CAPBridgeViewController`), quindi non scatta: lì i cookie
    AdE non arrivano. Se un giorno smette di valere, `CapacitorHttp` li
    manderebbe all'AdE.
  - **Android**: `clearCookies` del plugin **non cancella**, scrive
    `NOME=del`; `clearAllCookies` svuota il `CookieManager` di processo,
    Supabase compreso. Si fa scadere ogni nome con `CapacitorCookies`
    (`setCookie`, nel runtime Capacitor anche senza `enabled`) nelle tre
    chiavi possibili su `Path=/`: host-only, `Domain` dell'host, `Domain`
    di `.agenziaentrate.gov.it`, tutte `Secure`. Il Domain viaggia nel
    campo `path`, che Capacitor 8 concatena senza escape.
  - Dopo `close`, su ogni uscita, la pulizia si ripete e
    `reportAdeCookieResidue` rilegge: se resta un nome, apre un warning
    Sentry (`flow:spid-capture`) con i soli nomi. Gira in background, la
    cattura non lo aspetta. È il gate di una pulizia che smette di
    funzionare in silenzio: un upgrade di Capacitor o del plugin, un
    cookie scritto dopo la cancellazione.

---

## Debugging production HTTP flow errors

Quando un errore produzione suggerisce sequenza HTTP sbagliata:

1. Aggiungere diagnostic logging **prima** del fix (phase labels, cookie counts,
   response status)
2. Riprodurre l'errore locale per confermare la root cause
3. Solo allora scrivere il fix

Mai mergiare un fix hypothesis-based senza prima vedere l'evidenza diagnostica.

### Failure mode noto: socket keep-alive morto (`other side closed`)

`AdeNetworkError` con causa `SocketError: other side closed`
(`UND_ERR_SOCKET`) = undici ha riusato un socket keep-alive che il server
aveva già chiuso. Succede sistematicamente nei flussi con attese intrinseche
(CIE/SPID: poll push a 7s, approvazione umana) perché il keep-alive timeout
dei server AdE/IdP è più corto dei gap. Un browser ritenta in automatico su
una connessione fresca; il nostro client lo fa via retry singolo in
`request()` (`isStaleSocketError`, solo GET/HEAD — mai POST: doppio documento
fiscale). Se ricompare su una POST, NON estendere il retry: ragionare con la
semantica unknown-outcome di `submitDocument`/recovery.

Come leggerlo nei log: l'utente vede "portale AdE non raggiungibile" (mapping
`AdeNetworkError`), ma la vera firma è nella catena `caused by` del log
`warn`. Diagnosi rapida di una server action fallita da HAR del **nostro**
frontend: la response `text/x-component` contiene il JSON `{ error }` — da lì
si risale al messaggio in `error-messages.ts` e quindi alla classe d'errore
esatta, prima ancora di aprire i log server.

### Il `401` di Phase A non è un caso solo: leggi sempre `details`

`POST /api/login/telematico` risponde `401` con un body JSON che porta un campo
`details`, e quel campo è l'unica cosa che distingue tre situazioni con tre
rimedi **diversi**:

| `details`             | Classe                    | Cosa deve fare l'esercente           |
| --------------------- | ------------------------- | ------------------------------------ |
| `INVALID_CREDENTIALS` | `AdeAuthError`            | ricontrollare CF, password, PIN      |
| `PASSWORD_EXPIRED`    | `AdePasswordExpiredError` | cambiare la password (dialog in-app) |
| `ACCOUNT_LOCKED`      | `AdeAccountLockedError`   | sbloccare l'utenza sul portale AdE   |

Il riflesso sbagliato — e il default storico — è mappare tutto ciò che non è
`PASSWORD_EXPIRED` su `AdeAuthError`, cioè su «verifica codice fiscale,
password e PIN». Per un'utenza **bloccata** quel messaggio è falso due volte:
i dati sono giusti, e riscriverli è l'unica cosa che non serve — anzi, ogni
tentativo in più può prolungare il blocco. Misurato in produzione il
17/09/2026: tre riscritture e una mail all'assistenza che diceva, correttamente,
«ho richiesto questi dati stamattina e quindi sono giusti».

Regola generale che ne esce, valida oltre il `401`: **un campo diagnostico che
l'AdE manda e noi scartiamo diventa un messaggio che incolpa l'utente.** Quando
compare un `details` nuovo, gli si dà una classe e un messaggio prima di
lasciarlo cadere nel ramo generico. Il costo è una migrazione additiva sul
vocabolario di `last_verify_outcome` (la 0038 lo mette in conto, la 0041 è
l'esempio) e sono poche righe.

Il rimedio decide anche **se "Riprova" ha senso**. Su `INVALID_CREDENTIALS` no:
gli stessi dati danno lo stesso esito, e ogni tentativo è un login fallito
sull'utenza che l'AdE può trasformare in `ACCOUNT_LOCKED`. Il caso reale
(30/09/2026): utenza bloccata, l'esercente cambia password sul portale, torna
in app e preme "Riprova" tre volte in due minuti, con la password vecchia ancora
salvata. Per questo `verifyAdeCredentials` alza `credentialsRejected` solo su
`auth_error` e `AdeCredentialsSection` toglie il bottone finché la riga
credenziali non viene risalvata (`updated_at` cambia). Su `ACCOUNT_LOCKED` il
bottone resta: una volta sbloccata l'utenza, gli stessi dati sono giusti.

### Failure mode noto: `200` senza P.IVA = utenza sbagliata, non guasto

`wizardTemplate` (Fisconline/CIE, Phase F) o `dati/fiscali` / `gestori/me`
(SPID) rispondono `200` con un body valido in cui la P.IVA non c'è. Il login è
**riuscito** — `cfUidUltimo` è popolato — quindi la causa non è nelle
credenziali: la persona che accede non ha nessuna partita IVA intestata.
Succede a chi opera per una società, con delega a intermediario o come tutore.
Da quando la scelta dell'utenza di lavoro è cablata (sezione qui sotto) questo
ramo scatta solo a **zero** candidati — nessuna P.IVA diretta e nessun
incarico: non c'è niente da scegliere, e quell'accesso non può emettere.

Lo riconosci dalle chiavi che **restano** quando `PIva` manca: `hasDelega`,
`intermediario`, `richiestaIncarichi`, `soloPerMe`, `tutore`, `tutore_AT`. Sono
le altre personae del wizard — la loro presenza dice che la risposta è completa
e corretta, non troncata.

Classe dedicata `AdeNoPartitaIvaError`, ramo `ade_user_error` di
`logAdeFailure` (SCONTRINOZERO-13). **Non** un `AdePortalError(200, ...)`: uno
status inventato per una response sana finisce nel ramo `ade_failure`, apre
una issue Sentry per tentativo e non dice niente a nessuno.

Il `warn` compagno, `ade:wizard_piva_missing`, scatta su
`direct.length === 0 && incarichi.length === 0` — **entrambi**. La prima
versione guardava solo le P.IVA dirette, ed era giusta finché "zero dirette"
significava fallimento certo; da quando l'accesso incaricato è supportato è uno
stato normale, e per tre release il log ha registrato utenze che emettevano
scontrini senza problemi (undici eventi in un giorno, misurati il 17/09/2026).

Lezione che vale oltre questo log: **una feature che rende normale una
condizione di errore deve spostare anche il log che la sorvegliava.** Se non lo
fai, la telemetria continua a suonare l'allarme per il caso che hai appena
imparato a gestire, e smette di essere leggibile proprio quando ti serve. Il
gate sono i due test in `real-client.test.ts` che pretendono il **silenzio** su
un'utenza incaricata, con e senza scelta già fatta.

Due lezioni di contorno che valgono oltre questo caso:

- **Il messaggio d'errore decide quante volte l'utente riprova.** Con
  "Verifica fallita. Controlla le credenziali Fisconline" l'utente ha
  risalvato le stesse credenziali corrette quattro volte in quaranta secondi.
  Quando il login riesce e fallisce un passo successivo, il fallback generico
  del call-site è sempre sbagliato: serve un ramo in
  `getUserFacingAdeErrorMessage`.
- **La diagnostica struttura-only si ripaga.** `topLevelKeys` / `pIvaIsArray`
  / `pIvaLength` / `firstEntryKeys` (solo nomi di campo, mai i valori) hanno
  chiuso la diagnosi al primo evento utile, senza HAR e senza PII nei log.
  Stesso pattern prima di ogni throw su una response `200` inattesa.

### Utenza di lavoro: due body, non un parametro

Il login come `incaricato` (chi opera per una o più società) non è il flusso
`meStesso` con un campo diverso. `setUserChoice` cambia forma: niente `pIva`,
`cf` porta la partita IVA della **società**, e compaiono `incaricante`
(l'entry di `incarichi[]` ri-serializzata come **stringa JSON annidata**) e
`tipoincaricante`. Prima servono due `procediWizard`. Tracciato completo in
`HAR.md` #18 — leggilo prima di toccare `completePortalHandshake`.

Tre invarianti da non rompere:

- **La selezione persistita è una P.IVA, mai il payload opaco.** `raw` si
  risolve a ogni login cercando la P.IVA nella lista viva di `wizardTemplate`.
  Costa nulla e dà gratis il rilevamento dell'incarico revocato
  (`AdeUtenzaNotAvailableError`); conservare il blob significherebbe invece
  rispedire una struttura che il portale può aver cambiato sotto di noi.
- **Sul ramo incaricato Phase F non si salta mai**, nemmeno al re-auth su 401.
  L'ottimizzazione `knownPiva` vale solo per `meStesso`: senza la lista non
  esiste il payload da rimandare, e il re-auth fallirebbe solo quando la
  sessione scade — cioè tardi, in emissione.
- **`soloPerMe: false` si legge prima di offrire "Me stesso".** È il flag che
  dice che quell'opzione non è disponibile; sceglierla comunque fa rispondere
  al portale `Utenza di lavoro non valida o non autorizzata`.

**Multi-P.IVA è un caso solo, non due.** Più partite IVA proprie e più
incarichi arrivano da chiavi diverse di `wizardTemplate`, ma per chi sceglie la
domanda è identica: su quale partita IVA voglio operare. Quindi la scelta
persistita è una **stringa**, non un tipo con discriminante, e il client decide
quale corpo di `setUserChoice` usare cercandola in entrambe le liste vive. Una
P.IVA che l'AdE spostasse fra diretta e incarico non romperebbe niente.

Il login procede da solo **solo** con un'unica P.IVA diretta. In ogni altro
caso — più candidati, oppure un solo incarico — lancia
`AdeUtenzaSelectionRequiredError`, che **trasporta la lista**: è il punto di
aggancio del picker. Anche per un singolo incarico: la scelta è immutabile alla
prima verifica riuscita, e legare un account a una società per conto terzi senza
conferma si ripara solo aprendo un altro account.

Asimmetria da ricordare: le P.IVA **dirette** portano la `denominazione`, gli
incarichi solo il numero (`HAR.md` #18.1). Il picker mostra il nome quando c'è;
per gli incarichi arriverebbe solo dal secondo `procediWizard`, cioè dopo la
scelta.

**Il login ha due porte, non una.** Una sessione AdE si apre in due punti, e
implementando la scelta se ne vede uno solo: la **verifica credenziali**
(`onboarding-actions.ts`, l'utente è davanti allo schermo) e la **sessione
operativa** (`session-cache.ts` dietro `withAdeSession`, che serve emissione,
annullo, ricerca e recovery — nessuno davanti). Cablare `utenzaPiva` solo nella
prima ha prodotto la regressione v1.8.4: onboarding riuscito, primo scontrino
rifiutato con il messaggio del picker davanti a un esercente che la scelta
l'aveva già fatta. Il test che l'avrebbe vista non sta sul client, dove i
parametri si vedono: sta sul percorso che apre la sessione. Vale per qualunque
prossimo input del login — SPID, un secondo fattore, un header.

**Il messaggio e la UI vanno spediti insieme.** Fra due slice consecutive il
testo «non gestiamo ancora questo caso» è rimasto in produzione una release
oltre il picker che lo gestiva, contraddicendolo a schermo. Quando una slice
rimuove un limite, il messaggio che lo dichiarava è parte della slice, non un
residuo da ripulire dopo.

**Anche il picker ha due porte** — e questa è la terza volta che la stessa forma
di bug passa: impostazioni (`ade-credentials-section`) e onboarding
(`src/app/onboarding/onboarding-form.tsx`) sono **componenti diversi**, non uno
condiviso, e per tre release solo il primo montava il picker. Il secondo
riceveva `utenzaChoices` e lo scartava, mostrando «conferma qui sotto la partita
IVA» con niente sotto: vicolo cieco sull'unica superficie che un esercente nuovo
attraversa per forza.

Gate che sostituisce questa prosa (regola 7):
`src/components/ade/utenza-picker.contract.test.ts` enumera chi importa
`verifyAdeCredentials` e pretende che monti `UtenzaPicker` e legga
`utenzaChoices`. Le esenzioni stanno in `PICKER_NOT_REACHABLE`, una riga di
motivazione ciascuna, e devono corrispondere a un chiamante reale. Aggiungi una
superficie che chiama l'azione e `npm run test` te lo dice.

### Il cedente che mandiamo è nostro, non dell'AdE: sanno cose diverse

`getFiscalData()` (`GET .../doc/documenti/dati/fiscali`) restituisce l'intero
`AdeCedentePrestatore` dell'intestatario: `identificativiFiscali` (P.IVA + CF)
**e** `altriDatiIdentificativi`, che porta denominazione, indirizzo, civico,
CAP, comune, provincia. `buildCedenteFromBusiness` costruisce invece il cedente
dai campi di `businesses` e lo manda con `modificati: true`, che all'AdE
significa «ignora quello che hai, usa questo».

Sono quindi due identità che possono divergere in silenzio, e l'unica visibile
sullo scontrino è la nostra. Il caso che l'ha reso evidente (issue #984):
chi opera per conto di una società digita la ragione sociale al **primo** passo
dell'onboarding, prima di scegliere su quale P.IVA opererà — e lo scontrino
esce con la P.IVA della società e il nome della persona.

Due conseguenze permanenti:

- **Prima di dire che un dato del cedente non ce l'abbiamo, guarda cosa
  risponde `dati/fiscali`.** Di quella risposta persistiamo P.IVA e codice
  fiscale, la denominazione in `businesses.ade_denominazione` (0039) e la sede
  legale nelle cinque colonne `ade_indirizzo`/`ade_numero_civico`/`ade_cap`/
  `ade_comune`/`ade_provincia` (0040). Quel che resta fuori — `nome`,
  `cognome`, `nazione`, `defAliquotaIVA` — lo scartiamo, il che è una scelta,
  non un'assenza.
- **Il valore osservato dall'AdE non si riscrive addosso a quello scelto
  dall'utente.** `ade_denominazione` esiste per **confrontare**, non per
  sostituire: un'insegna diversa dalla denominazione anagrafica ("Da Mario"
  contro "ROSSI MARIO") è legittima, e riallineare in automatico cambierebbe
  ciò che è stampato su un documento fiscale per decisione nostra. Il confronto
  vive in `src/lib/business-identity.ts` e l'allineamento è un'azione esplicita
  (`applyAdeDenominazione`, `applyAdeSedeLegale`).
- **Le due identità non si allineano insieme.** Sulla denominazione l'AdE ha
  quasi sempre ragione; sulla sede legale no — può essere lo studio del
  commercialista mentre il punto vendita sta altrove, e sullo scontrino ci va
  il punto vendita. Un bottone solo costringerebbe a prendere l'indirizzo per
  avere il nome, quindi le due azioni restano separate. Vale come regola
  generale: prima di unire due allineamenti in uno, chiediti se divergere è un
  errore in entrambi i casi.

---

### Failure mode noto: dato del cedente non normalizzato (`EF0`)

`{"esito": false, "errori": [{"codice": "EF0", "descrizione": "'<Campo>' non valido"}]}`
= l'AdE ha rifiutato un campo del cedente/prestatore, non il documento. È un
errore d'**input utente** (regola 20: `warn`, non issue Sentry), ma permanente:
ogni emissione continua a fallire finché il dato in DB non viene corretto.

`buildCedenteFromBusiness` (`src/lib/ade/mapper.ts`) inoltra i campi di
`businesses` **verbatim**, quindi l'AdE valida ciò che abbiamo salvato. Caso
reale: `province = "na"` minuscolo → `EF0 'Provincia' non valido` su tutti gli
scontrini di un'attività, per settimane, senza che nulla nel codice fosse
rotto. L'AdE vuole la sigla maiuscola.

Regola generale: **ogni campo che finisce verbatim in un payload AdE va
normalizzato alla scrittura**, non a read-time nel mapper. Il mapper resta
puro (un solo punto di verità: quello che c'è in DB è già nel formato AdE);
normalizzano le server action che scrivono `businesses` — `saveBusiness`
(onboarding) e `updateBusiness` (settings), entrambe via `normalizeProvince`
in `src/lib/validation.ts`. Aggiungendo un campo al cedente, chiedersi
sempre: che formato pretende l'AdE, e chi lo garantisce alla scrittura?

Diagnosi: la risposta AdE è persistita in `commercial_documents.ade_response`,
quindi un `SELECT` sui documenti `REJECTED` di un business dà il codice e il
campo esatti senza toccare i log.

---

## Prima di chiedere un HAR: leggi `HAR.md`

I finding già estratti dalle catture vivono in `HAR.md` alla radice del repo —
voci numerate, autoconsistenti, con i payload verbatim e le risposte AdE. È la
**prima** fonte da consultare quando serve sapere come il portale compone un
campo: gli `.har` non esistono in un clone fresco, quel file sì.

Quando una nuova cattura risponde a una domanda, la risposta va tradotta lì
**nello stesso task**, con abbastanza numeri da rendere l'HAR superfluo
(payload, risposta, e il calcolo che lega i campi). Una voce che rimanda al
`.har` per il dettaglio non ha fatto il suo lavoro.

### Il payload non basta a sapere come si STAMPA: c'è un layout normativo

Un HAR dice come si compone il campo; **non** dice dove va sul documento che
il cliente riceve. Per quello la fonte è il PDF normativo dell'AdE:

<https://www.agenziaentrate.gov.it/portale/documents/20143/2571432/Layout+documento+commerciale_v4.pdf/>

Contiene i quattro layout (standard, compatto, reso, annullo), la tabella delle
codifiche natura → dicitura da stampare, le prescrizioni per il risparmio carta
e i casi speciali (arrotondamento DL 50/2017, omaggi). `src/lib/pdf/` e
`src/lib/printing/` sono modellati su quello, **non** sul PDF che genera il
portale DCO: le due rese differiscono, e prenderle l'una per l'altra è già
costato un finding (`HAR.md` voce #17 — lo sconto di riga è una riga propria,
non una colonna, e lo sconto a pagare sta dentro il blocco pagamenti).

Regola pratica: quando il task tocca **come appare** un elemento su PDF,
ricevuta pubblica o termica, il layout ufficiale vince sul PDF del portale.
Quando tocca **come si trasmette**, vince l'HAR misurato.

## HAR analysis: completezza, non solo ordine

Confrontando il codice contro una HAR capture, controllare esplicitamente che
**ogni request** in HAR sia presente nell'implementazione — non solo che
l'ordine matcha. Una call mancante è più difficile da spottare di una sbagliata.
Cross-reference request-by-request.

### Un HAR non è solo le chiamate API: leggi anche le risorse statiche

**Errore commesso (19/08/2026), da non rifare.** Analizzando gli HAR di vendita
si guardavano solo le request JSON verso `/ser/api/documenti/...`, ignorando le
partial HTML del wizard scaricate poche entry prima. Quelle partial contengono
il markup AngularJS del form, e rispondono a domande che il payload **non può**
risolvere: nel payload `NR_EF` vale sempre `{"tipo":"NR_EF","importo":"0.00"}`,
identico agli altri slot, mentre nel markup è una `<input type="checkbox">` con
`data-ng-true-value="'Y'"` che, quando spuntata, disabilita e svuota tutti gli
altri campi di pagamento. La conclusione "`totaleNonRiscosso` è la somma dei tre
`NR_*`" è rimasta scritta per settimane perché nessuno aveva aperto l'HTML.

Cosa cercare nelle entry non-API di una cattura del wizard AdE:

- **`wizard2-*.html`** — il form di **input**: tipo di controllo per ogni campo
  (checkbox vs testo), etichette ufficiali, tooltip esplicativi.
- **`wizard3.html`** — il **riepilogo**: come il portale rende ogni campo, spesso
  con l'etichetta che ne dichiara la semantica ("Sconto totale al netto
  dell'IVA", "Totale imponibile al lordo dello sconto").
- **`formhidden.html`** — i campi nascosti, con le **dipendenze fra campi**
  (`data-ng-disabled`, `data-empty-if`): è lì che si legge quali combinazioni il
  portale considera mutuamente esclusive.
- **`data-smart-float="-11.2"` / `-11.8`** — la **precisione dichiarata** del
  campo (cifre intere, decimali). Più affidabile di dedurla dai valori osservati.
- **`data-ng-required`, `data-ng-pattern`** — vincoli di validazione lato client.

Regola: prima di dichiarare "non misurabile senza una nuova cattura", cercare la
stringa nel **testo di tutte le entry** dell'HAR, non solo nei body JSON. Le
risposte spesso sono già lì.

### File HAR (capture locali, NON versionate)

⚠️ I `.har` sono **gitignorati** (`*.har` in `.gitignore`: contengono cookie e
dati di sessione reali): vivono in `har/` solo sulla macchina dell'owner e
**non esistono in un clone fresco** (CI, sessioni cloud). Se un task richiede
una HAR assente, chiederla all'utente — non cercarla nel repo.

| File                                                                      | Feature                                                         | Target                                                                                                       |
| ------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `dati_doc_commerciale.har`                                                | Aggiornamento dati business su AdE post-onboarding              | rinviato (possibile feature premium)                                                                         |
| `aggiungi_prodotto_catalogo.har`                                          | Aggiunta prodotto su rubrica AdE                                | nice-to-have (sync catalogo AdE)                                                                             |
| `modifica_prodotto_catalogo.har`                                          | Modifica prodotto su rubrica AdE                                | nice-to-have (sync catalogo AdE)                                                                             |
| `elimina_prodotto_catalogo.har`                                           | Eliminazione prodotto su rubrica AdE                            | nice-to-have (sync catalogo AdE)                                                                             |
| `ricerca_prodotto_catalogo.har`                                           | Ricerca prodotto su rubrica AdE                                 | nice-to-have (sync catalogo AdE)                                                                             |
| `ricerca.har`                                                             | Ricerca documento su AdE                                        | ✅ usata dal recovery (riconciliazione, sotto); recupero corrispettivi user-facing rinviato (roadmap v1.9.0) |
| `login_cie.har`                                                           | CIE login flow                                                  | ✅ **spedito in v1.5.0** — `loginCie` in `src/lib/ade/real-client.ts` (sezione "Due metodi d'accesso")       |
| `sconto_e_pagamento_misto.har`                                            | Vendita con sconto di riga, sconto a pagare e pagamento misto   | ✅ **tradotto in `HAR.md`** (voci #1-#8, #10-#13) — non serve più la cattura                                 |
| `annullo_doc_sconto_e_pagamento_misto.har`                                | Annullo dello stesso documento                                  | ✅ **tradotto in `HAR.md`** (voce #9): nessuna differenza rispetto ad `annullo.har`                          |
| `nuovo_test_sconto.har`                                                   | Vendita qta 2 @22% con sconto di riga (test di disambiguazione) | ✅ **tradotto in `HAR.md`** (voce #12): `prezzoLordo` è unitario, `scontoLordo` è di riga                    |
| `reso_parziale_1/2.har`, `vendita_tripla.har`, `annullo.har` (02/10/2026) | Reso merce parziale e totale, terzi, annullo dopo i resi        | ✅ **tradotto in `HAR.md`** (voce #19): oracoli verbatim in `tests/_helpers/reso-har-fixtures.ts`            |

---

## Correzioni di una vendita: le guardie le mettiamo noi

Annullo e reso (`HAR.md` #19) correggono la stessa vendita, e **l'AdE non li
coordina**: ha accettato l'annullo di una vendita già resa per intero,
stornando il corrispettivo due volte (#19f). Non c'è un rifiuto su cui
contare, quindi ogni regola fra le due correzioni sta nel nostro codice:

- **niente annullo dopo un reso**, letto due volte: nel DB, come colonna
  della SELECT della vendita (`saleHasAcceptedReturn`), prima di aprire la
  sessione; e con `hasAnyReturn` sul dettaglio GET che l'annullo legge
  comunque prima della POST, che vede anche i resi fatti dal portale. Su un
  cumulativo illeggibile `hasAnyReturn` blocca: una guardia contro un
  documento irreversibile non si apre per un campo che non sa leggere;
- **niente reso dopo un annullo**: stato della vendita nel DB, più il flag
  `annulli` della riga V per l'annullo fatto dal portale;
- **una sola correzione in volo per vendita**: indice unique
  `idx_commercial_documents_correction_in_flight` (migrazione 0042) su
  `COALESCE(voided_document_id, returned_document_id)` dove `PENDING`. Un
  indice invece di un lock: il conflitto arriva all'`ON CONFLICT DO NOTHING`
  che entrambi i service già gestiscono.

Regola generale: prima di contare su un rifiuto dell'AdE per una
combinazione di documenti, misurala. Il portale valida il singolo documento,
non la sua storia.

Il reso aggiunge anche un'asimmetria sulla riconciliazione: una vendita può
avere **più** resi, quindi `resi === progressivo` non basta come chiave (al
contrario di `annulli`). Serve l'importo, a **8 decimali** — due resi di
terzi diversi differiscono meno di un centesimo (#19c), e la lista di ricerca
li restituisce a piena precisione (#19e, misurato) — e per averlo
l'importo trasmesso si persiste **prima** della POST. Una riga senza importo
persistito non ha mai trasmesso: niente da cercare. Con l'importo si scrive
l'**istante** della POST (`submittedAt`), e la ricerca si centra lì: la
finestra è ±1 giorno, e una riga che ritrasmette giorni dopo la sua nascita
cercata intorno a `createdAt` non troverebbe la POST da riconciliare.

Un claim di recovery su annullo e reso **riapre** la riga a `PENDING`
(`claimStaleDocument(..., { reopen: true })`). Gli indici che serializzano le
correzioni di una vendita (0012 per i VOID, 0042 per entrambi) escludono
`ERROR`: ritrasmettere da una riga `ERROR` partirebbe fuori da tutti e due,
in parallelo a un'altra correzione — e l'AdE accetta il doppio storno
(#19f). Se un'altra correzione è già in volo la riapertura viola l'indice
(23505) e la richiesta si ferma prima della sessione AdE. La vendita non
riapre: non ha un indice da cui uscire. Regola generale: **uno stato che un
indice parziale esclude non è uno stato da cui si può trasmettere.**

### Il reso si fida delle righe che abbiamo trasmesso noi, e non sempre può

Le formule del reso (#19b) partono da `prezzoUnitario` e `scontoUnitario`
della vendita. Reggono solo se la riga rispetta le identità del mapper di
oggi — `prezzoUnitario × quantita ≈ imponibile` e
`imponibile − scontoUnitario ≈ imponibileNetto` — e **non** le rispettano:

- le vendite emesse fino alla **v1.7.0** (19/03–20/08/2026): quel mapper
  mandava `prezzoLordo` e `prezzoUnitario` di **riga** e `scontoUnitario`
  lordo per pezzo (`HAR.md` #11). Il reso di 1 pezzo su 2 stornerebbe il
  doppio, e l'AdE non lo rifiuterebbe;
- le vendite della Developer API con quantità a **tre decimali**: l'AdE riceve
  `quantita` arrotondata a due (0,125 → 0,13), gli importi restano sulla
  quantità vera.

`isReturnComputable` (`src/lib/ade/return-mapper.ts`) le riconosce con una
tolleranza di mezzo centesimo e il reso si rifiuta (`RETURN_NOT_ALLOWED`); il
mapper lancia se ci arriva lo stesso. Lezione che vale oltre il reso: **un
flusso che rilegge dall'AdE un documento nostro eredita ogni bug che il
mapper aveva quando l'ha emesso.** Prima di derivare importi da un documento
storico, chiediti con quale versione del mapper è nato.

Stessa famiglia: le quantità del reso arrivano allineate per indice alle
righe del **DB**, il mapper le applica a quelle dell'**AdE**. Il servizio
confronta per indice quantità e aliquota prima di trasmettere — non il
prezzo, che fino alla v1.7.0 viaggiava moltiplicato per la quantità.

## Recovery stale-pending: riconciliazione pre-retry (implementata)

AdE non accetta idempotency-key nel payload: se una `submitSale`/`submitVoid`
era arrivata ad AdE ma la response si è persa (timeout, container kill), un
retry cieco creerebbe un documento fiscale duplicato — **irreversibile**.
Il recovery in `src/lib/services/ade-recovery.ts` chiude questa finestra con
**due strati**, entrambi già in produzione:

1. **Gate di freschezza** — `getStalePendingThresholdMs()`: una row
   PENDING/ERROR entra nel recovery path solo se più vecchia di **30 min**
   (sopra la durata tipica di una sessione AdE; un retry sotto soglia ritorna
   `PENDING_IN_PROGRESS`). Override per test/E2E:
   `STALE_PENDING_THRESHOLD_MINUTES=5`. Soglia condivisa da
   `src/lib/services/receipt-service.ts` e `src/lib/services/void-service.ts`
   per evitare drift. Il claim del documento è un CAS ottimistico su
   `updated_at` (`claimStaleDocument`): serializza retry concorrenti senza
   tenere lock DB durante la HTTP AdE (2-5s).
2. **Riconciliazione pre-retry** — prima di ri-sottomettere, il recovery
   interroga AdE via `searchDocuments` (HAR: `ricerca.har`) e riconcilia con
   `reconcileSaleDocument`/`reconcileVoidDocument`: se AdE aveva già accettato
   → finalize-only (nessun duplicato fiscale); se non trovato → re-submit;
   lookup ambiguo o fallito → resta PENDING (fail-safe). Logging esplicito al
   rientro in recovery senza `adeTransactionId` per audit (PR #653,
   ormai risolto — vedi `docs/architecture/data-flows.md`).

3. **Ingresso** — il recovery è **pull-based**: si attiva solo quando un
   secondo tentativo collide sul vincolo UNIQUE
   `(business_id, idempotency_key)`. È la parte che si dimentica più
   facilmente, ed è costata il bug chiuso nella PR #904: la cassa coniava
   una chiave nuova a ogni submit, quindi nessun retry collideva e ogni fallimento lasciava una
   riga `PENDING` che nessuno avrebbe riconciliato mai. **La chiave di
   idempotenza è parte del meccanismo di recovery, non solo una misura
   anti-doppione**: se cambi come viene generata, stai cambiando anche quello.
   Oggi la genera `useCartIdempotencyKey` (`src/hooks/`), stabile per carrello
   con due rotazioni obbligatorie — a emissione riuscita (senza, due vendite
   identiche di fila riusano la chiave e la seconda non emette nulla) e a ogni
   modifica del carrello (senza, un ritocco produce
   `IDEMPOTENCY_PAYLOAD_MISMATCH` e blocca l'utente). Il dialog di annullo
   tiene la chiave stabile per la vita del dialog e non ha mai avuto il
   problema.
4. **Verifica manuale** — `src/lib/services/pending-verification.ts` è la
   stessa riconciliazione, ma chiamata **dall'esercente** invece che da una
   collisione: chiude le righe che il pull non raggiunge. Contratto diverso di
   proposito — un "nessun match" porta a `ERROR` e all'invito a riemettere,
   **mai** a un `submitSale`, perché ri-sottomettere è irreversibile e non è
   una decisione da prendere per conto suo. Su candidati multipli mostra la
   lista e non sceglie: chi sta al banco è l'unico che sa se la vendita è
   avvenuta. Uno sweep in `instrumentation.ts` e un avviso su `/admin` contano
   le righe rimaste in sospeso; lo sweep **conta e basta**, perché fuori da una
   richiesta utente non c'è una sessione AdE e non c'è nemmeno chi sa
   rispondere.

5. **I due canali hanno protocolli di idempotenza opposti** — e una capability
   di recovery scritta per uno non copre l'altro. La cassa **ruota** la chiave
   a ogni retry (vedi punto 3), quindi il pull non scatta mai e serve il banner
   del dashboard; la Developer API **impone di riusarla** (`DEVELOPER.md`,
   "Ritenta sempre con la stessa `idempotencyKey`"), quindi lì il retry
   dovrebbe entrare nel recovery da solo.

   ⚠️ **"Impone" non è "garantisce", e il solo consumer API in produzione non
   obbedisce.** Misurato sul DB il 22/09/2026
   (`docs/architecture/accepted-risks.md`): quattro righe
   `PENDING` dal 4 agosto, tutte via Developer API, due coppie con lo stesso
   `request_hash` a 57 e 20 secondi di distanza — cioè un client che ritenta
   dopo un timeout con una `idempotencyKey` **nuova** ogni volta. Ogni retry
   apre una riga nuova invece di rientrare nel recovery di quella vecchia, ed è
   la mossa che `receipt-service.ts` chiama in un commento "rischio doppione
   fiscale". Quindi il canale API si comporta **come la cassa**, non come il suo
   contratto: quando progetti una capability di recovery, il protocollo che
   conta è quello che i client **eseguono**, non quello che `DEVELOPER.md`
   prescrive. Corollario operativo: lo sweep di `pending-verification.ts`
   **conta e logga**, non riconcilia — la chiusura di una riga orfana passa
   sempre da un umano su `/admin`, e il `warn` non arriva a nessuno (regola 20:
   fuori da Sentry per costruzione).

   Il buco è simmetrico e non è la riconciliazione: è
   **trovare la riga**. Un client API che smette di ritentare lascia un
   `PENDING` che l'elenco pubblico non mostra — filtra `ACCEPTED`/
   `VOID_ACCEPTED` — e di cui non ha mai ricevuto l'id. Per questo l'envelope
   d'errore v1 porta `documentId` sugli esiti ancora aperti e
   `GET /api/v1/receipts` accetta `?status=PENDING`
   (`listStatusValues` in `src/lib/api-v1-helpers.ts`). Regola generale: quando
   aggiungi un modo di chiudere le righe orfane, chiediti **da quale canale
   nascono** e verifica che da quel canale siano visibili — non che esista da
   qualche parte una schermata che le mostra.

Storia: prima della riconciliazione la soglia dei 30 min era l'**unica**
mitigazione e il duplicato restava possibile oltre soglia. Se tocchi questo
flusso, l'invariante da testare è: nessun percorso chiama `submitSale`/
`submitVoid` su un documento che AdE ha già accettato — **e** nessun percorso
può lasciare una riga `PENDING` senza che qualcuno, prima o poi, la veda **dal
canale da cui è nata**.

---

## Leggere l'archivio AdE dentro la sessione di un esercente

Vale per ogni funzione che interroga il portale **per conto dell'utente che sta
guardando lo schermo** — la verifica di un PENDING (PR #904) e la
ricerca dei documenti nello storico (v1.8.0) — non per l'emissione.

**Cosa c'è in `GET /ser/api/documenti/v1/doc/documenti/`.** È l'archivio del
servizio _Documento Commerciale Online_: i documenti emessi **attraverso quel
servizio** — portale web AdE, app AdE, e qualunque software che lo piloti, noi
compresi. **Non** i corrispettivi trasmessi da un registratore telematico, che
vivono in un'altra area di Fatture&Corrispettivi. Chiamare la feature
"recupero corrispettivi" promette una cosa che l'endpoint non dà: il nome
onesto è "documenti commerciali".

**L'ingresso è uno solo:** `resolveAdeUserSession` in
`src/lib/services/ade-user-session.ts`. Prerequisiti + pre-check CIE/SPID +
`toAdeSessionParams`, senza effetti collaterali, e ritorna una **condizione**
(`reauth` col metodo, `unavailable`) non una frase: il messaggio lo scrive la
superficie, perché "rifai l'accesso per verificare lo scontrino" e "ricollegati
per cercare" non sono la stessa cosa. Emit e void restano fuori: hanno bisogno
anche di `cedentePrestatore` e rispondono con il loro tipo.

**Il costo va limitato, e la soglia è già decisa:** 20/ora per utente
(`pending-actions.ts`, `storico-actions.ts`). L'unità di costo è la stessa —
un login AdE più una o più `searchDocuments`, secondi di attesa e traffico sul
portale **a nome dell'esercente**, che è chi rischia il blocco dell'account.

**Una query copre al massimo 31 giorni, e oltre l'API risponde 406**
(`HAR.md` #16f). Non tronca in silenzio: rifiuta. Quindi i periodi lunghi si
spezzano in una query per mese solare (`buildAdeSearchRanges`) — un mese non
supera mai i 31 giorni, quindi il vincolo non si viola per costruzione — e le
query girano **dalla più recente alla più vecchia**, così un troncamento per
tempo scaduto perde la coda remota e non i documenti di ieri. Tieni distinti i due numeri: `ADE_QUERY_MAX_DAYS`
(31, del portale) e `ADE_SEARCH_MAX_DAYS` (366, quanto l'esercente può
chiedere). Confonderli è l'errore che la v1.8.0 ha fatto la prima volta.

**Una lettura lunga ha bisogno di un deadline suo.** Dodici query in sequenza,
ognuna paginata, possono superare il tempo che una risposta HTTP ha prima che
il proxy davanti all'app la chiuda — e un troncamento del proxy arriva
all'esercente come un errore senza spiegazione. Fermarsi da soli prima e
dichiarare `truncated` è l'unico modo di restituire qualcosa di leggibile.

**Impaginare l'archivio: contare ciò che arriva, non ciò che si è chiesto.**
`perPage` nelle catture reali vale 10 e non sappiamo se il portale accetti
valori alti o li ricapi in silenzio. Il ciclo di `fetchAdeSaleRows` avanza su
`elencoRisultati.length` e si ferma su una pagina vuota **qualunque cosa dica
`totalCount`**: così un `perPage` ricapato costa round-trip in più e nient'altro,
invece di un elenco troncato che sembra completo. Servono comunque due tetti
espliciti (documenti e pagine) e un flag `truncated` da mostrare: un elenco
tagliato in silenzio è peggio di un elenco assente.

**Lo stato di un documento si legge sulla vendita, non sull'annullo.** Il campo
`annulli` è polisemico (`HAR.md` #16c): su una riga `V` è il **flag** `"A"`
"documento annullato", su una riga `A` è il progressivo dell'annullato. Quindi
si interroga `tipoOperazione=V` e basta — una query invece di due. Si perde la
_data_ dell'annullo, che sta sulla riga `A`: se serve, è una seconda query, non
un campo da indovinare.

**Deduplicare contro i nostri documenti è obbligatorio.** Gli scontrini emessi
da ScontrinoZero sono in quell'archivio come tutti gli altri: senza sottrazione
compaiono due volte. La primitiva esiste già —
`findClaimedTransactionIds(db, { businessId, idtrxs })` in `ade-recovery.ts`,
con `excludeDocumentId` opzionale.

**Degradare a schermo, rifiutare su un file.** Se l'AdE non risponde mentre si
popola un elenco, le righe nostre restano e un avviso dice cosa manca (regola
19). Su un **export CSV** no: un file viene archiviato e riletto mesi dopo,
quando nessun avviso esiste più, quindi un fallimento è un 503 e nessun file.
La stessa condizione merita due risposte diverse perché le due superfici hanno
due durate diverse.

## Key rotation: `ENCRYPTION_KEY`

I segreti AdE sono cifrati con AES-256-GCM; la chiave sta in `ENCRYPTION_KEY`
(env var, 64 hex chars). Quali campi siano valorizzati dipende da
`login_method` (`src/db/schema/ade-credentials.ts`): Fisconline usa
`encrypted_codice_fiscale` + `encrypted_password` + `encrypted_pin`, CIE
`encrypted_username` + `encrypted_password` — la rotazione li tocca **tutti**
(regola "key_version è per riga", skill `security-patterns`). Se compromessa o
da ruotare:

### Runbook zero-downtime in tre fasi

L'app costruisce la key map di `decrypt()` con **`getEncryptionKeys()`**
(`src/lib/crypto.ts`), che tiene in memoria la chiave corrente **più** quella
precedente opzionale: durante la rotazione righe a v1 e righe a v2 sono
entrambe leggibili, quindi non serve alcuna finestra di fermo.

**Fase 1 — deploy con entrambe le chiavi in env:**

```bash
ENCRYPTION_KEY=<NUOVA_64_HEX>            ENCRYPTION_KEY_VERSION=<NUOVA>
ENCRYPTION_KEY_PREVIOUS=<VECCHIA_64_HEX> ENCRYPTION_KEY_PREVIOUS_VERSION=<VECCHIA>
```

Da qui le nuove scritture nascono già alla versione nuova. Smoke post-deploy
(regola 25) **prima** di procedere: una config a metà (`ENCRYPTION_KEY_PREVIOUS`
senza la sua `_VERSION`, o le due versioni uguali, o la stessa chiave in
entrambe) fa fallire `getEncryptionKeys()` con messaggio esplicito.

**Fase 2 — ri-cifrare le righe rimaste indietro** (ad app accesa):

```bash
npx tsx scripts/rotate-encryption-key.ts \
  --old-key  $ENCRYPTION_KEY_PREVIOUS \
  --old-version $ENCRYPTION_KEY_PREVIOUS_VERSION \
  --new-key  <NUOVA_64_HEX> \
  --new-version <NUOVA_VERSIONE>
```

Lo script legge tutti i record `ade_credentials`, decifra con la vecchia chiave,
ri-cifra con la nuova, aggiorna `key_version`, il tutto in `db.transaction()`
(atomico). È **idempotente**: salta le righe già alla nuova versione, quindi è
ri-eseguibile. Ripetere finché `Rotated: 0, Skipped: <tutte>`.

**Fase 3 — rimuovere `ENCRYPTION_KEY_PREVIOUS*` dall'env e ri-deployare.** Mai
prima della fase 2 completa: una riga ancora a v1 senza chiave v1 in env fa
fallire `decrypt()` con `Unknown key version: 1` (errore esplicito, non dato
corrotto — ma le credenziali di quel business restano inutilizzabili).

**Rollback (fasi 1-2):** invertire le due env (vecchia come `ENCRYPTION_KEY`,
nuova come `ENCRYPTION_KEY_PREVIOUS`) e ri-eseguire lo script a parti invertite.

### Generare una nuova chiave

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
