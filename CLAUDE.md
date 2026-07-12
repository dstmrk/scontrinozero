# CLAUDE.md — ScontrinoZero

## Progetto

ScontrinoZero è un registratore di cassa virtuale SaaS mobile-first per esercenti
e micro-attività: emette scontrini elettronici e trasmette i corrispettivi all'AdE
via "Documento Commerciale Online", senza registratore telematico fisico.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind 4 ·
shadcn/ui · TanStack Query/Table · PWA (Serwist) · Supabase Cloud (Postgres) ·
Drizzle ORM · Supabase Auth · Stripe (`2026-06-24.dahlia`) · Resend · Sentry ·
pino · Umami · SonarCloud · Vitest. Deploy Docker self-hosted su VPS dietro
Cloudflare Tunnel.

**Tre ambienti:**

- **Produzione** — `scontrinozero.it` · `ADE_MODE=real` · Stripe live · VPS
- **Sandbox** — `sandbox.scontrinozero.it` · `ADE_MODE=mock` · Stripe test · VPS
- **Dev** — `dev.scontrinozero.it` (+ `app-dev`/`api-dev`) · `ADE_MODE=mock` ·
  Stripe test · Raspberry Pi 5 (arm64). Auto-deploy a ogni push su `main`.
  Setup completo in `deploy/dev/README.md`.

Versione corrente in `package.json`. Roadmap in `PLAN.md`. Bug noti e tech
debt in `REVIEW.md` (registro prioritizzato P1/P2/P3: rimuovere la voce nel PR
del fix, aggiungere lì i nuovi finding). Storico release dai tag git
(`git tag -l "v1.*"`).

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
  Il divieto vale per il **runtime dell'app spedita**: per _verificare_ l'app dev
  che gira Claude può guidare un **Playwright MCP server** (Chromium reale, tool
  esterno di verifica mai nel bundle/immagine) — vedi skill `playwright-verify`.

## Mappa codebase — leggi prima di esplorare

Prima di un'esplorazione a tappeto (grep/glob diffusi per capire _dove_ stanno
le cose o _come_ scorrono i dati), **leggi `docs/architecture/INDEX.md`**: è la
mappa navigazionale (albero `src/`, tabella "Dove vivo X?", indice server
actions, moduli cross-cutting). Scendi ai deep-dive solo quando servono:
`docs/architecture/data-flows.md` (flussi end-to-end) e
`docs/architecture/config-manifest.md` (soglie/limiti/gate → puntatori ai file).
Le skill in `.claude/skills/` restano _prescrittive_ (come fare X); la mappa è
_descrittiva_ (dove sta X). Serve a ridurre il costo-token dell'esplorazione
iniziale.

## Regole sempre-attive (applicano a ogni task)

1.  **Branch separato sempre.** Mai commit/push diretti su `main`. PR sempre,
    merge spetta all'utente (a meno che non chiesto esplicito).
2.  **TDD.** Test prima dell'implementazione. Ogni file con logica ha il suo
    test file (anche `instrumentation.ts` e simili bootstrap).
3.  **Chiedi se ambiguo** prima di scrivere codice.
4.  **Edge case dopo ogni implementazione:** elencare gli edge case e aggiungere
    test che li coprono prima di committare.
5.  **Task > 3 file → break in sub-task.** Stop e suddividere.
6.  **Riflessione dopo correzione:** quando l'utente corregge, capire perché ho
    sbagliato e come non rifarlo.
7.  **Aggiornare `CLAUDE.md` (o la skill pertinente in `.claude/skills/`)
    autonomamente** dopo aver risolto un problema non triviale con lezione
    riusabile (debugging pattern, setup gotcha, wrong assumption). Non
    aspettare che lo chiedano.
8.  **Contenuti marketing & SEO → skill `marketing-content`.** MAI promettere
    feature non live (condizionale/roadmap, mai al presente). Se cambi
    label/menu/stati/gating, aggiorna i contenuti marketing nello stesso task
    (grep checklist nella skill). Slug separati `/help` vs `/guide`;
    contenuti LLM con review umana, in italiano.
9.  **Boundary delle API:** UUID validation con `isValidUuid()` + 400 prima del
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
15. **Link auth da marketing → app:** da `(marketing)/*` i link a
    `/login`/`/register`/`/reset-password` usano `appHref()` + plain `<a>`,
    MAI `<Link>` di Next. `appHref()` è server-only in pratica: calcola
    l'href nel parent server component e passalo come prop al client.
    Dettagli → skill `react-patterns`.
16. **Mock tipati (TS2556).** Mai spread di `...args` in un `vi.fn()` a zero
    argomenti: tipare il mock con la firma reale del modulo mockato — TS2556
    rompe `npm run type-check` prima dei test. → skill `testing-patterns`.
17. **Grandezze monetarie: canone per-riga in cents.**
    `round(grossUnitPrice * quantity * 100)` per riga, sommato come interi —
    MAI arrotondare per documento. Ogni `sort` prima di `slice`/topN ha una
    chiave secondaria stabile. Helper e motivazione → skill `money-rounding`.
18. **Env d'identità: build-vs-runtime e present-but-empty.** Un `?? default`
    NON scatta su variabile presente ma vuota (`""`); `next.config.ts` NON può
    importare con alias `@/`. Casi e fix → skill `deploy-release`.
19. **Server action di lettura: degradare, non lanciare.** Una server action
    che alimenta la UI ritorna `{ error }` su fallimento DB/SDK, MAI propaga
    l'eccezione: il throw fa scattare l'error boundary di Next al posto del
    fallback inline, rompendo la performance percepita (priorità #1).
20. **Errori d'input utente: warn, non error (no Sentry noise).** Condizioni
    prevedibili dall'input (credenziali AdE sbagliate, P.IVA già registrata,
    Turnstile scaduto) → `logger.warn`, MAI issue Sentry. Pattern
    `logAdeFailure()` + filtri client → skill `sentry-hygiene`.
21. **Osservabilità: validare il drain end-to-end al rollout.** Una feature di
    telemetria non è rilasciata finché la sentinella non appare in Sentry
    entro ~5 min (`/api/_debug/sentry-sentinel`). Procedura → skill
    `deploy-release` (smoke) e `sentry-hygiene` (query).
22. **`Sentry.setUser({ id })` su ogni richiesta autenticata** — bind già
    dentro `getAuthenticatedUser` (`src/lib/server-auth.ts`), non aggirarlo.
    Solo `id` UUID, mai email/ip (GDPR). Caveat API key → skill `sentry-hygiene`.
23. **Fingerprint Sentry per flow multi-step AdE.** Passa `flow: "<slug>"` nel
    context di `logAdeFailure()`; slug stabile o perdi lo storico del group.
    Meccanica e flow instrumentati → skill `sentry-hygiene`.
24. **Env d'identità: validazione fail-fast al boot.** `assertIdentityEnv()`
    (`src/lib/identity-env.ts`) gira come prima istruzione di `register()` in
    `src/instrumentation.ts`: in prod un valore malformato blocca il boot, in
    dev/test logga `warn`. Dettagli → skill `deploy-release`.
25. **Smoke test post-deploy: tre health probe (live + env + drain).** Nessun
    deploy è "concluso" senza i tre curl verdi su `/api/health/live`,
    `/api/_health/env` e `/api/_debug/sentry-sentinel`. Procedura canonica →
    skill `deploy-release`.
26. **Mappa codebase: tienila viva.** Quando sposti/rinomini/aggiungi un modulo
    cross-cutting, cambi un data flow o una soglia/limite/gate, aggiorna
    `docs/architecture/*` **nello stesso PR** ed esegui `npm run arch:check`
    prima di chiudere il task. Stesso spirito della regola 7 (aggiornamento
    autonomo della doc): una mappa obsoleta è peggio di nessuna mappa — fuorvia
    chi la legge al posto di esplorare. Il validatore
    `scripts/check-architecture-docs.mjs` fallisce se un path citato nella mappa
    **o in una skill** (`.claude/skills/*/SKILL.md`, inclusi i token path-like
    nella `description` frontmatter) non esiste più su disco; cita ogni path
    come span isolato (i token con `*`/`{}` sono ignorati come illustrativi).

27. **Date derivate e fonti di verità esterne (bonus/crediti).** Su una data
    DERIVATA asserisci l'esito osservabile user-facing, non lo shift
    intermedio; una grandezza posseduta da Stripe si aggiusta SU Stripe (poi
    il webhook risincronizza), MAI a read-time in locale. Trappole referral →
    skill `stripe-webhooks`, sezione referral/trial.

## SonarCloud quality gate

- Coverage on new code ≥ **80%**
- Duplicated lines on new code < **3%**
- **0 new issues** (fix sempre, anche con Quality Gate verde — accumulano debt)

Regole specifiche ricorrenti (S6861 readonly props, S6772 JSX spacing, S7780
template literals, S5852/S5122 hotspots, Gitleaks placeholder) → skill `sonar-quality-gate`.

## Stripe API version `2026-06-24.dahlia` — breaking changes

- `Invoice.subscription` rimosso → `invoice.parent?.subscription_details?.subscription`
- `Subscription.current_period_end` → `subscription.items.data[0]?.current_period_end`
- Mai `!` su `process.env.STRIPE_WEBHOOK_SECRET` — guard esplicito

Webhook events list (8 da registrare, niente di meno) e recovery patterns
nella skill `stripe-webhooks`.

## Workflow operativi

### Nuova migrazione DB

1. File `.sql` in `supabase/migrations/NNNN_*.sql` (nome descrittivo) con header comment
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
npm run arch:check          # path citati in docs/architecture/ e .claude/skills/ esistono ancora
```

Controlli manuali:

- [ ] Ogni `it()`/`test()` ha almeno un `expect()` (S6661 Blocker)
- [ ] Mock di classi usano `function`/`class` (non arrow)
- [ ] Variabili in `vi.mock` factory iniziano con `mock` (hoisting Vitest)
- [ ] Nessuna nuova issue SonarCloud Blocker/Critical

### Deploy e T&C → skill `deploy-release`

Deploy prod/sandbox tag-based (`git tag vX.Y.Z` → GHCR → compose su VPS),
deploy dev push-based (Raspberry Pi, traccia `main`), build-arg
`NEXT_PUBLIC_*` baked vs runtime, pairing widget Turnstile `:dev`, smoke
post-deploy e procedura aggiornamento T&C/Privacy: tutto nella skill
`deploy-release`.

## Pricing (per plan-gate nel codice)

| Piano       | Mensile | Annuale | Note                                                                                                                    |
| ----------- | ------- | ------- | ----------------------------------------------------------------------------------------------------------------------- |
| Starter     | €4.99   | €29.99  | Catalogo rapido max 5 prodotti, analytics base                                                                          |
| Pro         | €8.99   | €49.99  | Attivo: catalogo ∞, supporto prioritario, analytics avanzata, export CSV. In arrivo: recupero documenti commerciali AdE |
| Self-hosted | €0      | €0      | Tutte le feature, gestione autonoma                                                                                     |
| Unlimited   | —       | —       | Invite-only, `plan='unlimited'` su `profiles`                                                                           |

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
- **`stripe-webhooks`** — API `2026-06-24.dahlia`, 8 webhook events,
  stale-pending recovery AdE
- **`ade-integration`** — integrazione HTTP diretta, mock strategy, HAR
  analysis, rotazione `ENCRYPTION_KEY`
- **`sonar-quality-gate`** — regole S6861/S6772/S7780/S5852/S5122, Gitleaks,
  coverage exclusions
- **`react-patterns`** — Server vs Client Components, Next.js 16 async
  params/cookies/headers, React 19 Actions/`useOptimistic`/ref-as-prop,
  shadcn/ui + Radix `asChild`, TanStack Query provider unico, hydration
  mismatch, Tailwind 4 class ordering
- **`sentry-hygiene`** — review periodico issue archived (UX nascosto vs
  noise vero vs transient), filtri `beforeSend` documentati per ID issue,
  smoke post-deploy `live + env + drain`, query canoniche
  `errorClass:*` via Sentry MCP. Regole 20-25.
- **`playwright-verify`** — verifica funzionale dell'app dev con un browser reale
  (Playwright MCP / Chromium via curl su MCP Streamable-HTTP + service token
  Access, header service-token via `setExtraHTTPHeaders` per gli host dietro
  Access), screenshot supportati; limiti chiave: ceiling ~5s per request (una
  call breve per step, sfrutta lo stato persistito lato server), login
  Turnstile-gated → bypass captcha dev.

## Hook automatici (`.claude/hooks/`)

- `block-drizzle-generate.sh` — blocca `drizzle-kit generate` (regola 11)
- `block-push-to-main.sh` — blocca `git push` verso `main` / `HEAD:main`
  (regola 1)

Altri riferimenti già nel repo:

- **`docs/architecture/INDEX.md`** — mappa codebase (leggi prima di esplorare);
  deep-dive `docs/architecture/data-flows.md` e `docs/architecture/config-manifest.md`
- **`PLAN.md`** — roadmap funzionalità
- **`REVIEW.md`** — registro bug noti / tech debt prioritizzato (file:riga, fix)
- **`DEVELOPER.md`** — Developer API (Tier 1/2)
- **`docs/api-spec.md`** — surface REST + flussi HTTP AdE
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
