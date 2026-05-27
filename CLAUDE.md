# CLAUDE.md — ScontrinoZero

## Progetto

ScontrinoZero è un registratore di cassa virtuale SaaS mobile-first per esercenti
e micro-attività: emette scontrini elettronici e trasmette i corrispettivi all'AdE
via "Documento Commerciale Online", senza registratore telematico fisico.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind 4 ·
shadcn/ui · TanStack Query/Table · PWA (Serwist) · Supabase Cloud (Postgres) ·
Drizzle ORM · Supabase Auth · Stripe (`2026-02-25.clover`) · Resend · Sentry ·
pino · Umami · SonarCloud · Vitest. Deploy Docker self-hosted su VPS dietro
Cloudflare Tunnel.

**Due ambienti** sulla stessa VPS:

- **Produzione** — `scontrinozero.it` · `ADE_MODE=real` · Stripe live
- **Sandbox** — `sandbox.scontrinozero.it` · `ADE_MODE=mock` · Stripe test

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
8. **Aggiornare pagine `/help`** se si modifica una funzionalità (label, menu,
   stati, filtri, error flow, gating piani, nomi bottoni). `grep -rn "<termine>"
src/app/\(marketing\)/help` prima di chiudere il task. Feature non ancora
   implementate → riformulare al condizionale come roadmap.
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

## SonarCloud quality gate

- Coverage on new code ≥ **80%**
- Duplicated lines on new code < **3%**
- **0 new issues** (fix sempre, anche con Quality Gate verde — accumulano debt)

Regole specifiche ricorrenti (S6861 readonly props, S6772 JSX spacing, S7780
template literals, S5852/S5122 hotspots, Gitleaks placeholder) → skill `sonar-quality-gate`.

## Stripe API version `2026-02-25.clover` — breaking changes

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

| Piano       | Mensile | Annuale | Note                                             |
| ----------- | ------- | ------- | ------------------------------------------------ |
| Starter     | €4.99   | €29.99  | Catalogo rapido max 5 prodotti                   |
| Pro         | €8.99   | €49.99  | Catalogo ∞, analytics avanzata, export, AdE sync |
| Self-hosted | €0      | €0      | Tutte le feature, gestione autonoma              |
| Unlimited   | —       | —       | Invite-only, `plan='unlimited'` su `profiles`    |

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
- **`stripe-webhooks`** — API `2026-02-25.clover`, 8 webhook events,
  stale-pending recovery AdE
- **`ade-integration`** — integrazione HTTP diretta, mock strategy, HAR
  analysis, rotazione `ENCRYPTION_KEY`
- **`sonar-quality-gate`** — regole S6861/S6772/S7780/S5852/S5122, Gitleaks,
  coverage exclusions

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
