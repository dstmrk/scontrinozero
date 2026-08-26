---
name: sentry-hygiene
description: Use when triaging or reviewing Sentry issues for the dstmrk/scontrinozero project — periodic review of archived/ignored issues (e.g. SCONTRINOZERO-7 sat at 23 events for 5 weeks before anyone noticed it was UX, not noise), classifying a noisy issue (true bot/scanner noise → beforeSend filter with documented motivation; predictable user input → fix UX via regola 20 logAdeFailure ade_user_error; transient upstream → already covered by isTransientAdeError; client network failures → isClientNetworkFailure in src/lib/sentry-filters.ts), writing or extending the beforeSend filter in sentry.server.config.ts + src/lib/sentry-filters.ts, binding the user to the request scope with Sentry.setUser({ id }) via getAuthenticatedUser (regola 22, Users Impacted), grouping multi-step AdE flows with a flow fingerprint (regola 23, sentryFingerprint via logAdeFailure + Sentry.withScope in src/lib/logger.ts), validating the pino → Sentry Logs drain after a telemetry rollout via /api/health/sentry-sentinel (regola 21), running post-deploy smoke (live + env + drain via regole 21+25, procedure in the deploy-release skill), or looking up Sentry events via the Sentry MCP (mcp__Sentry__search_issues, search_events, get_sentry_resource) using the canonical query patterns (errorClass:ade_user_error / ade_transient / ade_failure / sentinel; sentinelId:<id>; flow-derived fingerprint).
---

# sentry-hygiene — Review e classificazione delle issue Sentry

Lezioni operative per non lasciare incancrenire il dataset Sentry: una
issue "archiviata come noise" che in realtà nascondeva UX (SCONTRINOZERO-7)
è peggio di una issue rumorosa che esplode una volta — perché diventa
invisibile.

---

## Quando triggerare il review

- **Prima di ogni release minor (`v1.X.0`)**: pull delle issue archived
  con > N eventi nelle ultime 4 settimane.
- **A ogni rollout di feature di osservabilità** (Sentry Logs, Pino
  integration, metrics): regola 21 di `CLAUDE.md` — sentinella entro
  ~5 min dal deploy.
- **Quando una issue archived sale di scala** (sub-status
  `archived_until_escalating` → `escalating`): ri-aprirla è un segnale
  che la classificazione iniziale era sbagliata.

Comando di pull (Sentry MCP):

```
mcp__Sentry__search_issues({
  organizationSlug: "dstmrk",
  projectSlugOrId: "scontrinozero",
  regionUrl: "https://de.sentry.io",
  query: "is:archived environment:production",
  sort: "freq",
  limit: 30,
})
```

---

## Classificare un'issue archived: sei rami

Ogni issue archived ricade in uno di questi 6 rami. La classificazione
guida l'azione, non viceversa.

### 1. Noise vero (bot/scanner, browser quirk non azionabile)

Esempio canonico: **SCONTRINOZERO-E** `TypeError: Failed to parse body
as FormData` su `POST /_not-found/page` da crawler che provano path
`/RSC/<hash>.txt`.

**Azione**: filtro esplicito in `sentry.server.config.ts:beforeSend`
con il predicato in `src/lib/sentry-filters.ts` e un commento che cita
l'ID issue:

```typescript
beforeSend(event, hint) {
  if (isBenignFormDataParseError(event, hint)) {
    return null; // SCONTRINOZERO-E: bot POST a /_not-found/page
  }
  return event;
}
```

Mai un filtro generico tipo "scarta tutto ciò che non ha stack utile":
ogni filter va con un predicato dedicato + commento che cita l'issue.

### 2. UX nascosto come noise (input utente prevedibile)

Esempio canonico: **SCONTRINOZERO-7** `AdeAuthError` (credenziali
sbagliate dal `/dashboard/settings`), 23 eventi in 5 settimane prima
dell'archiviazione.

**Sintomi**:

- Conteggio cumulativo alto, ma `Users Impacted` distribuito (non un
  utente che cicla).
- Il messaggio descrive una condizione che **l'utente può correggere**
  (credenziali, P.IVA già usata, token captcha scaduto, payment
  declined).
- Lo stack passa da una server action — non da un job batch o un cron.

**Azione**: regola 20 di `CLAUDE.md`. Spostare il throw in un return
`{ error: "..." }` e cambiare il log level a warn con `errorClass:
"ade_user_error"` (o equivalente). Pattern canonico:

```typescript
// src/lib/ade/log-failure.ts
if (isExpectedUserAdeError(err)) {
  logger.warn(
    { err, ...context, errorClass: "ade_user_error" },
    messages.failure,
  );
  return;
}
```

`isExpectedUserAdeError` copre `AdeAuthError` + `AdePasswordExpiredError`.
Estensione naturale: copia il pattern per Stripe (card declined),
Resend (bounced email) appena emerge il caso.

Il `logger.error` (level ≥ 50) → `Sentry.captureException` va riservato a
condizioni inattese (DB down, SDK che fallisce in modo non documentato):
un errore d'input utente in Sentry è noise esattamente come "password
sbagliata su `/login`".

**Lato client** lo stesso principio si applica tramite `clientBeforeSend`
(`src/lib/sentry-filters.ts`), montato in **`instrumentation-client.ts`**: i
fallimenti di rete browser (`TypeError: Load failed` su iOS, `Failed to fetch`
su Chrome) generati da `fetchServerAction` sono sempre transitori (connessione
mobile caduta) — filtrati da `isClientNetworkFailure()` (SCONTRINOZERO-J).

> ⚠️ **Il bootstrap client è solo `instrumentation-client.ts`.** Il legacy
> `sentry.client.config.ts` viene iniettato **unicamente** dal path webpack del
> SDK (`@sentry/nextjs/build/cjs/config/webpack.js`); con Turbopack — il
> bundler di default di Next 16, quello con cui buildiamo — non finisce mai nel
> bundle. Per cinque settimane i tre filtri client e Session Replay sono
> rimasti configurati lì e **morti in produzione** (SCONTRINOZERO-V). Come si
> verifica in 30 secondi, senza attendere il prossimo evento: scarica i chunk
> referenziati da una pagina e cerca una stringa che esiste solo nel nostro
> codice —
>
> ```bash
> curl -s https://scontrinozero.it/ -o page.html
> for c in $(grep -oE '/_next/static/chunks/[A-Za-z0-9_./-]+\.js' page.html | sort -u); do
>   curl -s "https://scontrinozero.it$c" -o chunk.js
>   grep -qF 'Load failed","Failed to fetch' chunk.js && echo "filtri client presenti in $c"
>   grep -qF 'rrweb' chunk.js && echo "Session Replay presente in $c"
> done
> ```
>
> Nessun match (o nessun `rrweb`/`replayIntegration` per il Replay) = la
> configurazione non è nel bundle, qualunque cosa dica il sorgente.

### 3. Transient upstream (rete, 5xx esterno, SPID timeout)

Esempio: AdE in downtime, Stripe webhook intermittente.

**Azione**: già coperto da `isTransientAdeError` (ramo
`ade_transient` di `logAdeFailure`). Per altri SDK estendere lo stesso
pattern: predicato → `logger.warn` con `errorClass: "<sdk>_transient"`,
mai `logger.error`.

### 4. Allarme infra corretto ma per-richiesta (throttle, non downgrade)

Esempio: `getClientIp` (`src/lib/get-client-ip.ts`) emette
`logger.error({ critical: true })` quando `CF-Connecting-IP` manca in
produzione. È una **misconfigurazione nostra**, non input utente: la regola 20
non si applica e il livello `error` deve restare (altrimenti la scopriamo solo
dopo un'ondata di abuso, con tutti i bucket rate-limit collassati su
`"unknown"`). Ma il call-site è attraversato a **ogni richiesta HTTP**: senza
freno un incidente reale genera un evento Sentry per request, brucia la quota
free e allaga i Sentry Logs — cioè lo strumento con cui lo si diagnosticherebbe.

**Azione**: throttle a livello di modulo sull'**allarme**, mai sul
comportamento (il fail-closed vale per ogni singola richiesta):

```ts
const MISSING_CF_IP_LOG_INTERVAL_MS = 5 * 60 * 1000;
let lastMissingCfIpLogAt = 0; // 0 → il primo miss allarma subito

const now = Date.now();
if (now - lastMissingCfIpLogAt >= MISSING_CF_IP_LOG_INTERVAL_MS) {
  lastMissingCfIpLogAt = now;
  logger.error({ critical: true }, "…");
}
```

Due dettagli non negoziabili:

- esportare un `reset…ForTests()` (stesso pattern del singleton install-prompt,
  skill `pwa-serwist`): lo stato è di modulo, senza reset le suite si
  influenzano a vicenda **in base all'ordine d'esecuzione** — e i test già
  esistenti che asseriscono il log falliscono a caso;
- armare il throttle **solo** nel ramo che logga davvero: se lo si arma anche
  fuori produzione (o quando l'header c'è), il primo miss reale resta silenzioso
  per tutta la finestra.

### 4-bis. Prima di indagare: l'evento è davvero **nostro**?

`environment: production` non significa "la nostra produzione". Il `Dockerfile`
fissa `ENV NEXT_PUBLIC_SENTRY_DSN` nell'immagine finale, che è **pubblica su
GHCR** perché il self-hosting è un piano supportato: ogni istanza self-hosted
esegue il nostro codice, con il nostro DSN e il nostro tag di release, e le sue
issue arrivano qui indistinguibili dalle nostre.

**SCONTRINOZERO-11 è il caso di studio**, e il costo è stato un'ora. Un allarme
`CF-Connecting-IP` mancante con Host estraneo (`scontrino.ettawalkup.it`) è
stato letto come attacco: prima scansione opportunistica, poi phishing, poi
raccolta credenziali — arrivando a un passo dal bloccare al WAF e segnalare per
abuso quello che era un **utente self-hosted**. Ogni indizio "ostile" aveva una
lettura banale: l'Host estraneo era il suo `APP_HOSTNAME`, gli UA che ruotavano
erano i suoi visitatori, il redirect `/` → `/dashboard` era `proxy.ts` che
girava a casa sua.

**Il check che chiude la questione in trenta secondi** — confronta il device
context dell'evento con la macchina di produzione:

```bash
uptime -s; nproc; free -b | head -2   # sul VPS
```

contro `boot_time`, `processor_count` e `memory_size` nell'evento. Se non
combaciano, l'evento non è nostro e l'indagine finisce lì. Utile anche
`server_name` (hostname del container) e la coppia
`app_start_time` / riavvii noti.

**Il segnale complementare**: se l'issue riporta traffico verso un host,
verifica su Cloudflare (Security → Events, o l'anteprima "requests matched" di
una regola WAF) che quel traffico esista. Zero richieste da quell'IP in 24 ore
significa che la tua infrastruttura non è mai stata toccata.

**Azione**: `isForeignHostEvent()` in `src/lib/sentry-filters.ts` scarta in
`beforeSend` (client e server) gli eventi il cui `request.url` non è
`scontrinozero.it` o un sottodominio. Due invarianti da non rompere:

- il dominio è **hardcoded**, mai derivato da `APP_HOSTNAME` /
  `NEXT_PUBLIC_*_HOSTNAME`: un self-hoster quelle env le imposta col proprio
  dominio, e un filtro env-derived sarebbe un no-op proprio dove serve;
- **fail-open** sull'host indeterminabile: gli errori senza `request.url`
  (cron, migrazioni, boot) sono i nostri e non vanno persi.

Il filtro gira dentro l'istanza self-hosted, quindi l'evento non parte proprio
— ma solo dalle immagini che lo contengono. Le istanze su tag più vecchi
continuano a riportare finché non fanno `pull`: l'unica leva immediata su
quelle è ruotare il DSN (REVIEW #97).

### 5. Deploy skew: non è un guasto, ma va gestito (non filtrato)

Esempio canonico: **SCONTRINOZERO-Z** `UnrecognizedActionError: Server Action
"<id>" was not found on the server` su `/onboarding`, un'ora dopo il deploy di
`v1.7.2`.

**Come riconoscerlo**: l'ID delle Server Action è generato da Next in modo NON
deterministico **a ogni build**, quindi ogni release invalida gli ID in mano
alle sessioni già aperte. Basta una scheda (o una finestra PWA, che nessuno
chiude mai) caricata sulla release N-1 che invii un form dopo il rilascio della
N. Non è prevenibile self-hosted: Skew Protection è di Vercel e
`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` riguarda il multi-istanza, mentre noi
serviamo da un container solo. Le normali navigazioni invece si auto-guariscono
(su build ID diverso Next fa una hard navigation): **solo le Server Action
sono un vicolo cieco**.

**Cosa NON fare**: filtrarlo in `beforeSend`. Il commento di
`isBenignServerActionNotFound` (`src/lib/sentry-filters.ts`, SCONTRINOZERO-T)
lo dice già — su `/_not-found` è un bot, sul path reale è skew genuino e va
lasciato passare. È anche l'unica misura di quanti utenti prende lo skew a ogni
release.

**Cosa fare**: gestirlo nel boundary. `isDeploySkewError` +
`recoverFromDeploySkew` (`src/lib/deploy-skew.ts`) riconoscono l'errore e
ricaricano la pagina — la cura documentata da Next — con marcatore in
`sessionStorage` che evita il secondo rimbalzo se ricaricare non risolve. Il
fallback condiviso (`src/components/errors/app-error-fallback.tsx`) fa
`Sentry.flush()` **prima** del reload: il reload interrompe le richieste in
volo e senza flush l'evento appena accodato può non partire.

Due lezioni di contorno, ripescabili su qualsiasi errore client:

- **Un'action che rigetta dentro `startTransition` finisce al boundary**: React
  19 rilancia l'errore dell'action durante il render, non resta una promise
  rigettata. Un segmento senza `error.tsx` cade quindi su `global-error.tsx`,
  che rimpiazza il documento intero — `<h2>` nudo, senza CSS né shell. Era il
  caso di tutto ciò che sta fuori da `/dashboard` fino a SCONTRINOZERO-Z; ora
  la rete è `src/app/error.tsx`.
- **`Users: 0` su una issue client non vuol dire "nessuno colpito"**: il bind
  di `Sentry.setUser` è server-side (regola 22), gli eventi del browser non
  hanno mai `user.id`. Per pesare l'impatto di un'issue client servono il
  Session Replay e il conteggio eventi, non la colonna Users.

### 6. Il browser ci riscrive il DOM sotto: si neutralizza, non si filtra

Esempio canonico: **SCONTRINOZERO-Y** `Hydration Error` sulla homepage, 6
eventi in 2 giorni da 6 città italiane diverse — e **100% Mobile Safari su
iPhone**, zero desktop, zero Android.

**Come riconoscerlo.** Una distribuzione browser che collassa su un solo
motore non è un bug del nostro codice: è una feature di quel browser che ci
tocca il documento. Su iPhone sono i **data detectors** di Safari, che
riscrivono ogni digit-run lungo in `<a href="tel:…"
x-apple-data-detectors="true">` mentre il documento viene parsato — cioè
prima che React idrati, che quindi trova un `<a>` dove l'HTML del server
aveva un text node. Il bersaglio da noi era la P.IVA in footer
(`P.IVA<!-- --> <!-- -->11836750015`, text node nudo).

Due letture che servono per non archiviarlo come rumore:

- Il tipo `replay_hydration_error` **non** è una diff euristica del replay:
  nasce dal breadcrumb `replay.hydrate-error`, cioè da un mismatch che React
  ha segnalato davvero.
- Il replay dice `Errors: 0` **e il mismatch è comunque reale**: React 19 si
  ripara ri-renderizzando lato client, quindi nessuna eccezione risale — ma il
  primo paint si butta. Su una pagina SEO è un costo, non un pareggio.

**Azione**: si toglie di mezzo la feature del browser, non l'evento da Sentry.
`formatDetection: { telephone: false }` nel `metadata` del **root** layout
(`src/app/layout.tsx`, SCONTRINOZERO-Y) → `<meta name="format-detection"
content="telephone=no">` su ogni pagina. Nel root e non nel gruppo
`(marketing)` perché la stessa riscrittura prende il `documentId` della
ricevuta pubblica e la P.IVA in onboarding/settings, dove un numero che
diventa un pulsante "chiama" è un bug UX anche a hydration a posto. Solo
`telephone`: `date`/`address`/`email` Safari non li applica di default.

**Verifica**, visto che i data detectors sono di Safari vero e Chromium (e
quindi la skill `playwright-verify`) non li ha: `npm run build`, poi contare
gli `.html` prerenderizzati che portano la meta —

```bash
for f in $(find .next/server/app -name "*.html"); do
  grep -q 'format-detection' "$f" || echo "MANCA: $f"
done
```

L'unico atteso senza è `_global-error.html`: `global-error.tsx` rimpiazza il
documento intero, quindi sta fuori dal root layout by design. L'altra prova a
costo zero è aprire uno dei replay allegati e guardare se nel DOM registrato
il numero è diventato un link `tel:`.

---

## `Sentry.setUser({ id })` su ogni richiesta autenticata (regola 22)

Tutte le server action e i route handler che chiamano
`getAuthenticatedUser()` bindano automaticamente l'auth user UUID allo scope
Sentry della richiesta: il bind è già **dentro** `getAuthenticatedUser` in
`src/lib/server-auth.ts` — non va rifatto a mano, va solo non aggirato.

Senza questo `Users Impacted` resta a 0 su ogni issue: tutte e 10 le issue
Sentry analizzate (SCONTRINOZERO-7 a -H) avevano `Users: 0` anche quando il
bug toccava più utenti in 2 minuti — il triage non poteva prioritizzare per
impatto.

Passare **solo `id`** (UUID opaco di Supabase Auth): niente
`email`/`username`/`ip`, coerente con l'**allowlist** `SAFE_KEYS` di
`src/lib/logger.ts` (solo le chiavi elencate raggiungono Sentry; `ip` è escluso
di proposito a favore di `ipHash`) e con la policy GDPR. Per le route che usano auth diversa
(es. Bearer API key in `/api/v1/*`) il fix è analogo ma puntuale a ciascun
handler — **non** propagare l'`apiKeyId` come `user.id`.

---

## Fingerprint per flow multi-step (regola 23)

I flow AdE (login → wizard → submit) generano errori in step diversi: Sentry
li raggruppa per `message + stack`, quindi `wizardTemplate failed 500` e
`setUserChoice failed 500` finiscono in 2 issue distinte anche se parte della
stessa onboarding fallita (SCONTRINOZERO-9 + -A, trace_id 5efe8519…).

Per evitarlo, **passa `flow: "<nome-flow>"` nel context di `logAdeFailure()`**
(`src/lib/ade/log-failure.ts`): sul ramo `ade_failure` viene iniettato
`sentryFingerprint: [flow, "ade_failure"]` nel payload pino, e
`captureToSentry` in `src/lib/logger.ts` lo applica via
`Sentry.withScope(s => s.setFingerprint(...))`. I rami warn
(transient/user_error) ignorano `flow`: non salgono a Sentry.

Flow già instrumentati: `onboarding-verify` (verifyAdeCredentials),
`emit-receipt` (receipt-service), `void-receipt` (void-service). Per nuovi
flow scegli uno **slug stabile** (no spazi, no version): cambia il
fingerprint = perdi la continuità storica del group.

---

## Lookup puntuale via Sentry MCP

Tre query canoniche, già supportate dai tag che il repo emette:

**Sentry Logs (dataset `logs`)** — degrado userside o transient:

```
errorClass:ade_user_error environment:production
errorClass:ade_transient environment:production
errorClass:sentinel sentinelId:<id>   # validazione drain (R21)
```

**Sentry Issues (default `errors`)** — eventi che hanno superato il
`level≥50` hook:

```
errorClass:ade_failure environment:production
errorClass:ade_failure flow:onboarding-verify  # group per flow (R23)
```

Per validare un singolo trace user-session:

```
mcp__Sentry__search_events({
  organizationSlug: "dstmrk",
  dataset: "spans",
  query: "trace:<trace_id>",
  ...
})
```

Storico: SCONTRINOZERO-9, -A, -B condividevano `trace_id 5efe8519…`,
3 issue distinte per un'unica onboarding fallita. Con la regola 23 i
sub-step finiscono nello stesso group.

---

## Warning di runtime nei log del container: censire prima di sospettare

`MaxListenersExceededWarning: Possible EventEmitter memory leak detected. 11
close listeners added to [ServerResponse]` **non è una perdita nostra**. Il
tetto di Node è 10 per emitter; una singola risposta in Next 16 standalone ne
accumula 8 (route leggera) fino a 11 (pagina RSC o route in streaming), e
NESSUNO di quei listener è codice applicativo: 2 li mette `@sentry/core`
(`recordRequestSession` per la release health e `setContext("response")` in
`server-subscription`), gli altri Next (cleanup zlib del router, due passate di
`signalFromNodeResponse`, `res.onClose` delle fetch metrics, `AfterContext`,
abort controller + writer della pipe RSC). Muoiono tutti con la risposta.

Fix in repo: `SERVER_RESPONSE_MAX_LISTENERS` in `src/instrumentation.ts`, alzato
**solo** sul prototype di `http.ServerResponse` — mai
`EventEmitter.defaultMaxListeners`, che nasconderebbe una perdita vera su pool
DB o stream pdfkit — e abbastanza basso da far riscattare il warning se un
domani qualcuno registrasse davvero listener per-risposta senza rimuoverli.

**Metodo, riusabile per qualsiasi warning opaco di Node** (regola 13: niente
fix su ipotesi). Il sorgente non basta, i listener arrivano dalle dipendenze:

1. `npm run build` + avvia `.next/standalone/server.js` con
   `node --trace-warnings -r <preload>.cjs server.js`.
2. Nel preload, wrappa `http.ServerResponse.prototype.on/once/addListener`,
   confronta `listenerCount(event)` prima e dopo (la chiamata interna che
   `once()` delega a `on()` NON è un secondo listener: senza il confronto si
   conta il doppio) e stampa la prima frame di stack utile.
3. Filtra dalla stack `node:internal`, `node:events` e
   `next/dist/compiled/compression` — la middleware di compressione rimpiazza
   `res.on` e si intrufola come frame in cima a ogni add, nascondendo il
   chiamante vero.
4. `assertIdentityEnv()` fa **fallire il boot** se `NEXT_PUBLIC_APP_URL` non è
   https (regola 24): per un repro locale serve un build con un hostname
   https finto, non `http://localhost:3000`.
5. Sentry si instrumenta solo con la DSN valorizzata: senza
   `NEXT_PUBLIC_SENTRY_DSN` (baked al build, regola 18) mancano 2 listener su
   8 e il censimento risulta falsato.

---

## Smoke post-deploy → skill `deploy-release`

La procedura canonica dei tre probe (live + env + drain, regole 21+25) vive
nella skill `deploy-release`. Lato Sentry, la validazione del drain è:
cerca `errorClass:sentinel sentinelId:v$VERSION` (dataset `logs` **e**
pannello issues) entro ~5 min dal deploy; se la sentinella non appare →
integrazione rotta, rollback o riapri la PR.

---

## Pattern repo: ogni guard cita l'ID issue

Quando aggiungi un filtro `beforeSend`, un `logAdeFailure`, un
`safeSessionStorage`, o un `getTrustedAppUrl`, **commenta esplicito**
l'ID Sentry che ha originato il fix. Esempi già in repo:

- `src/lib/safe-storage.ts` → cita `SCONTRINOZERO-H`
- `src/lib/trusted-app-url.ts` → cita `SCONTRINOZERO-F` + regola 18
- `sentry.server.config.ts:beforeSend` + `src/lib/sentry-filters.ts` →
  cita `SCONTRINOZERO-E`
- `src/lib/ade/log-failure.ts` → cita `SCONTRINOZERO-7` (regola 20)
- `src/instrumentation.ts` → cita `SCONTRINOZERO-F` + regola 24
- `src/lib/deploy-skew.ts` → cita `SCONTRINOZERO-Z`
- `src/app/layout.tsx` (`formatDetection`) → cita `SCONTRINOZERO-Y`

Rende la lezione trovabile in `grep -rn "SCONTRINOZERO-<id>"` e
preserva il filo storico anche dopo che l'issue è archived in Sentry.

---

## Anti-pattern: archiviare senza classificare

`Archive until escalating` è un'opzione potente ma silenziosa: l'issue
ricompare solo se il volume cresce. Se è "noise" deve diventare un
filter (ramo 1 sopra); se è "UX" deve diventare un fix (ramo 2). Lasciarla
archived senza azione = nascondere il debito.

Storico (lezione che ha portato a questa skill): SCONTRINOZERO-7 è
rimasta archived per 5 settimane e 23 eventi prima di essere
ri-classificata come UX. Il review periodico (sezione 1 sopra) esiste
proprio per intercettare questa categoria.
