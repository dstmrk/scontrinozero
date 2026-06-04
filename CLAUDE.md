# CLAUDE.md — ScontrinoZero

## Progetto

ScontrinoZero è un registratore di cassa virtuale SaaS mobile-first per esercenti
e micro-attività: emette scontrini elettronici e trasmette i corrispettivi all'AdE
via "Documento Commerciale Online", senza registratore telematico fisico.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind 4 ·
shadcn/ui · TanStack Query/Table · PWA (Serwist) · Supabase Cloud (Postgres) ·
Drizzle ORM · Supabase Auth · Stripe (`2026-04-22.dahlia`) · Resend · Sentry ·
pino · Umami · SonarCloud · Vitest. Deploy Docker self-hosted su VPS dietro
Cloudflare Tunnel.

**Tre ambienti:**

- **Produzione** — `scontrinozero.it` · `ADE_MODE=real` · Stripe live · VPS
- **Sandbox** — `sandbox.scontrinozero.it` · `ADE_MODE=mock` · Stripe test · VPS
- **Dev** — `dev.scontrinozero.it` (+ `app-dev`/`api-dev`) · `ADE_MODE=mock` ·
  Stripe test · Raspberry Pi 5 (arm64). Auto-deploy a ogni push su `main`.
  Setup completo in `deploy/dev/README.md`.

Versione corrente in `package.json`. Roadmap in `PLAN.md`. Storico release dai
tag git (`git tag -l "v1.*"`).

## Principi guida

- **Performance percepita = priorità #1.** Optimistic UI, skeleton loading,
  route prefetching, SSG marketing. L'emissione scontrino sembra istantanea
  anche se AdE risponde in 2-5 secondi.
- **Hobby project, costi fissi ~€0.** Pricing aggressivo possibile perché il
  costo marginale per utente è ~zero.
- **Leggeri sulle risorse.** No headless browser (Playwright/Puppeteer/Chromium):
  integrazione AdE solo via HTTP diretto. PDF via `pdfkit` (Node puro, ~500KB) —
  richiede `serverExternalPackages: ["pdfkit"]` in `next.config.ts`. Dipendenze
  minime, Next standalone, Docker slim, un solo container (next-app + cloudflared).

## Regole sempre-attive (applicano a ogni task)

1. **Branch separato sempre.** Mai commit/push diretti su `main`. PR sempre,
   merge spetta all'utente (a meno che non chiesto esplicito).
2. **TDD.** Test prima dell'implementazione. Ogni file con logica ha il suo
   test file (anche `instrumentation.ts` e simili bootstrap).
3. **Chiedi se ambiguo** prima di scrivere codice.
4. **Edge case dopo ogni implementazione:** elencare gli edge case e aggiungere
   test che li coprono prima di committare.
5. **Task > 3 file → break in sub-task.** Stop e suddividere.
6. **Riflessione dopo correzione:** quando l'utente corregge, capire perché ho
   sbagliato e come non rifarlo.
7. **Aggiornare `CLAUDE.md` (o la skill pertinente in `.claude/skills/`)
   autonomamente** dopo aver risolto un problema non triviale con lezione
   riusabile (debugging pattern, setup gotcha, wrong assumption). Non
   aspettare che lo chiedano.
8. **Contenuti marketing & SEO.** I contenuti vivono in route dedicate con un
   data file ciascuna: `/help` (operativo, `src/app/(marketing)/help`), `/guide`
   (educativo, `src/lib/guide/articles.ts`), `/per/[slug]` (categorie,
   `src/lib/per/categories.ts`), `/confronto` (`src/lib/confronto/comparisons.ts`),
   `/strumenti/[slug]` (tool gratuiti backlink-magnet, `src/lib/strumenti/tools.ts`).
   Regole sempre valide:
   - **Niente promesse di feature non live** in _nessun_ copy marketing: feature
     non implementate → condizionale/roadmap, mai al presente. Oggi sul Pro
     restano "in arrivo" solo recupero corrispettivi AdE e sync catalogo AdE;
     Analytics avanzata ed Export CSV sono **spedite e Pro-gated** (commit
     ae1c481).
   - **Slug separati `/help` vs `/guide`** sulle keyword condivise per evitare
     canonical clash (es. `/help/regime-forfettario` ≠
     `/guide/regime-forfettario-scontrini`); si linkano a vicenda.
   - Se modifichi una funzionalità (label, menu, stati, filtri, error flow,
     gating piani, nomi bottoni) aggiorna i contenuti: `grep -rn "<termine>"
src/app/\(marketing\)` prima di chiudere il task.
   - Contenuti generati via LLM con **review umana**, in italiano, target Italia.
9. **Boundary delle API:** UUID validation con `isValidUuid()` + 400 prima del
   service; body size guard con `readJsonWithLimit(req, maxBytes)` + 413 prima
   di `JSON.parse`; email normalizzata con `normalizeEmail()` in `validation.ts`
   come prima riga di ogni auth action.
10. **Wrap SDK esterni (Stripe, AdE, Resend) in try-catch** con log strutturato
    e response 503 — mai lasciare propagare 500 senza context.
11. **DB migrations: TUTTE handwritten dopo `0000`.** 🚫 **MAI eseguire
    `npx drizzle-kit generate`** nello stato attuale del repo (conflitto con
    handwritten migrations). Workflow nella skill `db-migrations`. Un hook
    PreToolUse blocca automaticamente questo comando.
12. **Debug CI failure opachi:** se SonarCloud/Gitleaks flagga qualcosa non
    visibile nel diff/log, **chiedere all'utente** quale file/riga invece di
    tentare blind fix.
13. **Debug produzione HTTP (AdE 4xx, ecc.):** aggiungere diagnostic logging
    prima del fix, riprodurre locale, confermare la root cause. Mai mergiare
    un'ipotesi senza evidenza.
14. **HAR analysis:** verificare che **ogni request** in HAR sia presente
    nell'implementazione, non solo l'ordine. Cross-reference one-by-one.
15. **Link auth da marketing → app:** i link verso `/login`, `/register`,
    `/reset-password` dalle pagine/componenti del gruppo `(marketing)/*` (e
    da `src/components/marketing/`, `src/components/help/`) devono usare
    `appHref()` (da `@/lib/marketing-to-app-href`) + plain `<a>`, **mai**
    `<Link>` di Next.js. Serve a forzare la cross-origin navigation verso
    `app.scontrinozero.it`: il soft routing di Next farebbe restare l'utente
    sull'origin marketing, riportando il bug `captcha_hostname_mismatch` su
    Turnstile (commit ac59efc). **`appHref()` è server-only in pratica**:
    da un client component (es. `pricing-section.tsx`) `NEXT_PUBLIC_APP_URL`
    non è nel bundle (non baked dal Dockerfile) e `APP_HOSTNAME` non è
    `NEXT_PUBLIC_*`, quindi cadrebbe sul default hardcoded di produzione
    rompendo sandbox/self-hosted. Calcolare l'href nel parent server
    component e passarlo come prop al client.
16. **Mock tipati (TS2556).** Mai fare spread di `...args` in un `vi.fn()` a
    zero argomenti: tipare il mock con la **firma reale** del modulo mockato
    (`notFound()` non prende argomenti, `redirect(path)` uno). Lo spread di
    `unknown[]` rompe `npm run type-check` con **TS2556** _prima_ ancora che i
    test partano — non lo cattura il run dei test (PR #553, #572). Correzione
    ricorrente: vedi skill `testing-patterns`.
17. **Ordini deterministici prima di slice/topN.** Ogni `sort` che precede uno
    `slice`/topN deve avere una **chiave secondaria stabile** (es. descrizione
    normalizzata) oltre alla metrica primaria: ordinare sui soli `revenueCents`
    rende l'output non deterministico sui pareggi. E **coerenza arrotondamenti**:
    aggregare con lo stesso helper del resto (`calcDocTotal`, arrotondamento
    per-documento), mai per-riga, altrimenti i totali del breakdown non
    combaciano con KPI/pagamenti sullo stesso range (PR #519, #534).
18. **Env d'identità: build-vs-runtime e present-but-empty.** Un `?? default`
    **non** scatta se la variabile è presente ma **vuota** (`""`): nel
    `Dockerfile` bakare un default reale nell'`ARG`/`ENV` o **non** esportarla
    affatto quando assente, altrimenti prod/sandbox bakano una stringa vuota
    (CORS origin / reporting endpoint vuoti — PR #560). E `next.config.ts`
    **non** può importare moduli con alias `@/`: la transpilation del config
    non li risolve e `next build` fallisce _prima_ di generare le route — usare
    import relativi (PR #536). Estende regola 15 e le note Deploy.
19. **Server action di lettura: degradare, non lanciare.** Una server action che
    alimenta la UI (KPI/analytics, ecc.) deve ritornare `{ error }` su fallimento
    DB/SDK, **mai** propagare l'eccezione: il throw fa scattare l'error boundary
    di Next al posto del fallback inline, rompendo la performance percepita
    (priorità #1). Coerente con regola 10 e con il pattern `deleteAccount` della
    skill `testing-patterns` (PR #572, `getStarterKpis`).
20. **Errori d'input utente: warn, non error (no Sentry noise).** Le condizioni
    prevedibili dall'input utente — credenziali Fisconline sbagliate, password
    AdE scaduta, P.IVA già registrata, token Turnstile scaduto — vanno loggate
    a `logger.warn` (osservabilità in pino → Sentry Logs) ma **non** devono
    salire a Sentry come issue: non sono bug nostri, esattamente come "password
    sbagliata su `/login`". Il `logger.error` (level ≥ 50) →
    `Sentry.captureException` va riservato a condizioni inattese (DB down, SDK
    fallisce in modo non documentato). Pattern canonico per AdE:
    `logAdeFailure()` in `src/lib/ade/log-failure.ts` con
    `errorClass: "ade_user_error"` per `AdeAuthError` / `AdePasswordExpiredError`
    (`isExpectedUserAdeError`), `ade_transient` per network/5xx/SPID timeout
    (`isTransientAdeError`), `ade_failure` solo per il resto. Storico:
    SCONTRINOZERO-7 ha collezionato 23 eventi in 5 settimane prima di essere
    archiviata come noise, perché ogni utente che digitava credenziali AdE
    sbagliate da `/dashboard/settings` finiva in Sentry. Estende la regola 19
    alle server action di scrittura.
21. **Osservabilità: validare il drain end-to-end al rollout.** Quando si
    abilita o si modifica una feature di telemetria (`enableLogs`,
    `Sentry.pinoIntegration`, `Sentry.metrics`, Sentry Profiling, Replays,
    nuovo `transport` pino, ecc.), il deploy **non è "concluso" finché una
    sentinella intenzionale non appare in dashboard entro ~5 minuti**. Se
    non appare → integrazione rotta = bug bloccante, si rollback o si
    riapre la PR. Procedura: imposta `SENTRY_SENTINEL_TOKEN` sull'env
    target e fai `curl -H "x-sentinel-token: $TOKEN"
https://<host>/api/_debug/sentry-sentinel?id=<release>`; la response
    contiene `sentryQuery`, una stringa già pronta da incollare nei filtri
    Sentry — sia il dataset `logs` (info/warn/error) sia il pannello issues
    (l'`error` emette anche `Sentry.captureException` via il hook a
    `level≥50` in `src/lib/logger.ts`). Endpoint:
    `src/app/api/_debug/sentry-sentinel/route.ts` — protetto da
    timing-safe compare, risponde 404 se il token è assente o non combacia
    (esistenza nascosta a chi non ha il secret). Riferimento: v1.3.6
    (rollout `Sentry.pinoIntegration`) è stato il caso che ha forzato la
    regola — il dataset `logs` era vuoto al momento dell'analisi e non si
    poteva distinguere "drain rotto" da "rilasciato 40 minuti fa".
22. **`Sentry.setUser({ id })` su ogni richiesta autenticata.** Tutte le
    server action e i route handler che chiamano `getAuthenticatedUser()`
    bindano automaticamente l'auth user UUID allo scope Sentry della
    richiesta (visto che il bind è già dentro `getAuthenticatedUser` in
    `src/lib/server-auth.ts:51`). Senza questo `Users Impacted` resta a 0
    su ogni issue: tutte e 10 le issue Sentry analizzate (SCONTRINOZERO-7
    a -H) avevano `Users: 0` anche quando il bug toccava più utenti in 2
    minuti — il triage non poteva prioritizzare per impatto. Passare **solo
    `id`** (UUID opaco di Supabase Auth): niente `email`/`username`/`ip`,
    coerente con il denylist `SAFE_KEYS` di `src/lib/logger.ts` e con la
    policy GDPR. Per le route che usano auth diversa (es. Bearer API key
    in `/api/v1/*`) il fix è analogo ma puntuale a ciascun handler — non
    propagato qui per non leakare l'`apiKeyId` come `user.id`.
23. **Fingerprint Sentry per flow multi-step.** I flow AdE (login → wizard
    → submit) generano errori in step diversi: oggi Sentry li raggruppa per
    `message + stack`, quindi `wizardTemplate failed 500` e
    `setUserChoice failed 500` finiscono in 2 issue distinte anche se
    parte della stessa onboarding fallita (SCONTRINOZERO-9 + -A,
    trace_id 5efe8519…). Per evitarlo, **passa `flow: "<nome-flow>"`
    nel context di `logAdeFailure()`** (`src/lib/ade/log-failure.ts`):
    sul ramo `ade_failure` viene iniettato
    `sentryFingerprint: [flow, "ade_failure"]` nel payload pino, e
    `captureToSentry` in `src/lib/logger.ts` lo applica via
    `Sentry.withScope(s => s.setFingerprint(...))`. I rami warn
    (transient/user_error) ignorano `flow`: non salgono a Sentry. Flow
    già instrumentati: `onboarding-verify` (verifyAdeCredentials),
    `emit-receipt` (receipt-service), `void-receipt` (void-service).
    Per nuovi flow scegli uno slug stabile (no spazi, no version):
    cambia il fingerprint = perdi la continuità storica del group.
24. **Env d'identità: validazione fail-fast al boot.** Le env che producono
    URL/redirect (`NEXT_PUBLIC_APP_URL` + le 6 varianti `*_HOSTNAME`)
    sono validate da `assertIdentityEnv()` in `src/lib/identity-env.ts`,
    chiamato come **prima istruzione** di `register()` in
    `src/instrumentation.ts` (runtime nodejs). In produzione un valore
    malformato fa **throware al boot** e il container non parte —
    invece di produrre 503 al primo route che costruisce URL, come
    succedeva con SCONTRINOZERO-F (5 eventi su utente FR/Stripe
    checkout) e SCONTRINOZERO-D (action_link hostname mismatch). In
    dev/test la stessa validation logga `warn` ma non blocca il loop.
    Il check copre tre classi di failure: malformed URL/hostname,
    present-but-empty (regola 18, `?? default` non scatta su `""`), e
    `http` invece di `https` in prod. Le guardie lazy esistenti
    (`getTrustedAppUrl()`, `parseTrustedHostnameEnv()`) restano in piedi
    come secondo strato — defense in depth, non vengono toccate.

## SonarCloud quality gate

- Coverage on new code ≥ **80%**
- Duplicated lines on new code < **3%**
- **0 new issues** (fix sempre, anche con Quality Gate verde — accumulano debt)

Regole specifiche ricorrenti (S6861 readonly props, S6772 JSX spacing, S7780
template literals, S5852/S5122 hotspots, Gitleaks placeholder) → skill `sonar-quality-gate`.

## Stripe API version `2026-04-22.dahlia` — breaking changes

- `Invoice.subscription` rimosso → `invoice.parent?.subscription_details?.subscription`
- `Subscription.current_period_end` → `subscription.items.data[0]?.current_period_end`
- Mai `!` su `process.env.STRIPE_WEBHOOK_SECRET` — guard esplicito

Webhook events list (8 da registrare, niente di meno) e recovery patterns
nella skill `stripe-webhooks`.

## Workflow operativi

### Nuova migrazione DB

1. File `.sql` in `supabase/migrations/NNNN_description.sql` con header comment
2. Entry in `supabase/migrations/meta/_journal.json`
   (`idx` incrementale, `when` = `Date.now()`, `tag` = nome file senza `.sql`)
3. Aggiorna schema Drizzle in `src/db/schema/<table>.ts`
4. `node scripts/check-migrations.mjs` (anche in CI)
5. `npx tsx scripts/migrate.ts` su DB locale, verificare idempotenza al re-run

Pattern ADD COLUMN: `ADD COLUMN IF NOT EXISTS`, mai `NOT NULL` su tabelle già
popolate senza default. Dettaglio + bootstrap su DB pre-esistente nella skill
`db-migrations`.

### Worktree setup (`.claude/worktrees/<name>/`)

- `npm install` (no `node_modules` symlink)
- Copy `.env.local` dalla root del main repo
- `rm -rf .next` in worktree E main repo prima del dev server (evita stale
  Turbopack chunks)

### Pre-PR

```bash
npm run lint                # ESLint / TypeScript
npx prettier --check src/   # ⚠️ dopo modifiche a classi Tailwind: prettier --write
npm run test:coverage       # tutti i test verdi, coverage non in calo
```

Controlli manuali:

- [ ] Ogni `it()`/`test()` ha almeno un `expect()` (S6661 Blocker)
- [ ] Mock di classi usano `function`/`class` (non arrow)
- [ ] Variabili in `vi.mock` factory iniziano con `mock` (hoisting Vitest)
- [ ] Nessuna nuova issue SonarCloud Blocker/Critical

### Deploy (tag-based)

```
sviluppo → PR → merge main → CI
git tag vX.Y.Z → GitHub Actions: build Docker + push GHCR
VPS (Cloudflare Access SSH):
  cd /opt/scontrinozero && docker compose pull && docker compose up -d
```

⚠️ Variabili `NEXT_PUBLIC_*` sono **baked al build** (non runtime): vanno
passate come `--build-arg` al `docker build`. `APP_HOSTNAME` (senza
`NEXT_PUBLIC_`) è runtime e sovrascrive l'hostname baked — usato per sandbox
e self-hosting su dominio custom.

> Nota: un'unica immagine Docker serve prod/sandbox/dev/self-hosted. Molte
> `NEXT_PUBLIC_*` (Supabase, Stripe) sono lette **server-side a runtime** in
> standalone e bastano nel `.env`. MA quelle d'**identità** (`NEXT_PUBLIC_APP_URL`,
> `_APP_HOSTNAME`, `_MARKETING_HOSTNAME`, `_API_HOSTNAME`) sono valutate anche al
> **build** (marketing SSG, `next.config` redirects/headers, `metadataBase`) e
> finiscono nel bundle client (`appHref` in `header.tsx`, client component):
> vanno passate come `--build-arg` se servono valori non-prod. Il `Dockerfile`
> le accetta; prod **non** le passa (→ default `app.scontrinozero.it`),
> l'immagine `:dev` sì (→ `app-dev`). Sandbox condivide l'immagine prod → su
> questi link resta sul default prod (limite noto). Idem
> `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (`turnstile-widget.tsx`) e
> `NEXT_PUBLIC_SENTRY_DSN` (`sentry.client.config.ts`). Coerente con regola 15.
>
> **Turnstile per dev:** `:dev` baka un **widget Turnstile dedicato** (secret
> `NEXT_PUBLIC_TURNSTILE_SITE_KEY_DEV` in `deploy-dev.yml`, fallback alla key
> prod se assente). ⚠️ Site key bakata e `TURNSTILE_SECRET_KEY` runtime nel
> `.env` del Pi **devono essere dello stesso widget**: la `NEXT_PUBLIC_*` è
> baked → la riga `NEXT_PUBLIC_TURNSTILE_SITE_KEY` nel `.env` del Pi è ignorata.
> Mismatch → siteverify risponde `invalid-input-secret` (secret non
> riconosciuta) o `invalid-input-response` (token di un altro widget), e ogni
> login fallisce con "Verifica CAPTCHA fallita". Diagnosi dall'`errorClass` in
> `auth-actions.ts` (`captcha_verification_failed`).

### Deploy dev (push-based, Raspberry Pi)

A differenza di prod/sandbox (tag-based), **dev traccia `main`**: a ogni push
(commit o merge di PR) `.github/workflows/deploy-dev.yml` builda l'immagine
**arm64** su runner `ubuntu-24.04-arm`, la pubblica come `ghcr.io/dstmrk/
scontrinozero:dev` e notifica il Pi via webhook firmato (HMAC + Cloudflare
Access). Sul Pi `adnanh/webhook` (systemd) esegue `docker compose pull && up -d`.
Stessa immagine di prod, solo arch diversa; tutte le differenze d'ambiente
vivono nel `.env` runtime. File e istruzioni in `deploy/dev/`.

### Procedura aggiornamento T&C

1. Crea `src/app/(marketing)/termini/vXX/page.tsx`
2. Aggiorna redirect in `src/app/(marketing)/termini/page.tsx` → `/termini/vXX`
3. Aggiorna `CURRENT_TERMS_VERSION = "vXX"` in `src/server/auth-actions.ts`
4. Aggiorna il **secondo flag** (clausole vessatorie art. 1341 c.c.) in
   `src/app/(auth)/register/page.tsx` con i nuovi numeri di paragrafo

Privacy Policy: stessa procedura, aggiungere anche a `sitemap.ts`,
`sitemap.test.ts` e `sonar.coverage.exclusions`. Notifica utenti ≥15 giorni
prima dell'entrata in vigore.

## Pricing (per plan-gate nel codice)

| Piano       | Mensile | Annuale | Note                                                                                                   |
| ----------- | ------- | ------- | ------------------------------------------------------------------------------------------------------ |
| Starter     | €4.99   | €29.99  | Catalogo rapido max 5 prodotti, analytics base                                                         |
| Pro         | €8.99   | €49.99  | Attivo: catalogo ∞, supporto prioritario, analytics avanzata, export CSV. In arrivo: recupero/sync AdE |
| Self-hosted | €0      | €0      | Tutte le feature, gestione autonoma                                                                    |
| Unlimited   | —       | —       | Invite-only, `plan='unlimited'` su `profiles`                                                          |

Feature gate canonico in `src/lib/plans.ts`. Trial 30 giorni Starter/Pro, no
carta all'iscrizione. P.IVA UNIQUE nel DB (anti-abuso trial).

## Skill dominio-specifiche

Le lezioni dettagliate vivono in `.claude/skills/<name>/SKILL.md` e si
auto-attivano quando il task matcha il `description`:

- **`testing-patterns`** — Vitest, `expect()` obbligatori, mock di classi,
  rate limit, JOIN refactor, NODE_ENV, mock Drizzle transaction, Sentry+pino
- **`db-migrations`** — handwritten migrations, bootstrap DB pre-esistente,
  Drizzle raw `sql\`\``con`Date`, race / idempotency per-tenant
- **`security-patterns`** — `CF-Connecting-IP`, UUID/body/email guards,
  hostname validation, double-gate rate limit, CSP, prototype-safe lookup
- **`stripe-webhooks`** — API `2026-04-22.dahlia`, 8 webhook events,
  stale-pending recovery AdE
- **`ade-integration`** — integrazione HTTP diretta, mock strategy, HAR
  analysis, rotazione `ENCRYPTION_KEY`
- **`sonar-quality-gate`** — regole S6861/S6772/S7780/S5852/S5122, Gitleaks,
  coverage exclusions
- **`react-patterns`** — Server vs Client Components, Next.js 16 async
  params/cookies/headers, React 19 Actions/`useOptimistic`/ref-as-prop,
  shadcn/ui + Radix `asChild`, TanStack Query provider unico, hydration
  mismatch, Tailwind 4 class ordering

## Hook automatici (`.claude/hooks/`)

- `block-drizzle-generate.sh` — blocca `drizzle-kit generate` (regola 11)
- `block-push-to-main.sh` — blocca `git push` verso `main` / `HEAD:main`
  (regola 1)

Altri riferimenti già nel repo:

- **`PLAN.md`** — roadmap e backlog
- **`DEVELOPER.md`** — Developer API (Tier 1/2)
- **`docs/api-spec.md`** — surface REST
- **`README.md`** — overview pubblico

## Scelte architetturali rapide

Tutte motivate dalle priorità sopra (performance, hobby project, leggero):

- **Next.js** monolite (SSR + Server Actions, no backend separato)
- **Supabase** vs Firebase (Postgres standard, RLS nativo, no lock-in)
- **PWA** vs nativa (un codebase, no store, update istantanei)
- **shadcn/ui** (copy-paste in repo, Radix sotto)
- **Integrazione diretta AdE** (zero costo per scontrino, no terzi)
- **Cloudflare Tunnel** (HTTPS/CDN/DDoS gratis, IP nascosto)
- **Stripe** (fee EU 1.5% + €0.25, API ottima; MoR rimandato)
- **Resend** (free 3k/mese, React Email type-safe)
- **TDD** (integrazione AdE fragile, refactoring sicuro)
- **Due ambienti** (AdE irreversibile: uno scontrino emesso non si cancella)
- **Umami self-hosted** (GDPR, no cookie, gratis sulla stessa VPS)
