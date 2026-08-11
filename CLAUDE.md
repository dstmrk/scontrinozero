# CLAUDE.md — ScontrinoZero

## Progetto

ScontrinoZero è un registratore di cassa virtuale SaaS mobile-first per esercenti
e micro-attività: emette scontrini elettronici e trasmette i corrispettivi all'AdE
via "Documento Commerciale Online", senza registratore telematico fisico.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind 4 ·
shadcn/ui · TanStack Query/Table · PWA (Serwist) · Supabase Cloud (Postgres) ·
Drizzle ORM · Supabase Auth · Stripe (`2026-07-29.dahlia`) · Resend · Sentry ·
pino · Umami · SonarCloud · Vitest. Deploy Docker self-hosted su VPS dietro
Cloudflare Tunnel.

**Tre ambienti:**

- **Produzione** — `scontrinozero.it` · `ADE_MODE=real` · Stripe live · VPS
- **Sandbox** — `sandbox.scontrinozero.it` · `ADE_MODE=mock` · Stripe test · VPS
- **Dev** — `dev.scontrinozero.it` (+ `app-dev`/`api-dev`) · `ADE_MODE=mock` ·
  Stripe test · Raspberry Pi 5 (arm64). Auto-deploy a ogni push su `main`.
  Setup completo in `deploy/dev/README.md`.

Versione in `package.json` · roadmap `PLAN.md` · bug noti/tech debt
`REVIEW.md` (P1/P2/P3: rimuovi la voce nel PR del fix, aggiungi lì i nuovi
finding) · Developer API `DEVELOPER.md` · surface REST + flussi HTTP AdE
`docs/api-spec.md` · overview pubblico `README.md` · release dai tag git.

## Principi guida

- **Performance percepita = priorità #1.** Optimistic UI, skeleton loading,
  route prefetching, SSG marketing. L'emissione scontrino sembra istantanea
  anche se AdE risponde in 2-5 secondi.
- **Hobby project, costi fissi ~€0.** Pricing aggressivo possibile perché il
  costo marginale per utente è ~zero.
- **Semplice ora, ma mai provvisorio.** L'implementazione più semplice che
  soddisfa _interamente_ i requisiti attuali: niente astrazioni, config o
  indirezioni speculative per casi ipotetici. Ma la scelta architetturale si fa
  per il lungo periodo: mai un tappabuchi pensato per essere rifatto dopo. Il
  sistema cresce a strati — la versione minima che funziona end-to-end, poi
  ogni capability sopra un prodotto già funzionante. Mai barattare un prodotto
  funzionante per complessità incompiuta.
- **Leggeri sulle risorse.** No headless browser nel **runtime dell'app
  spedita** (AdE solo via HTTP diretto; PDF via `pdfkit` +
  `serverExternalPackages` in `next.config.ts`); dipendenze minime, Next
  standalone, un solo container. Per _verificare_ l'app dev Claude può guidare
  un Playwright MCP server (mai nel bundle) — skill `playwright-verify`.

## Mappa codebase — leggi prima di esplorare

Prima di grep/glob a tappeto **leggi `docs/architecture/INDEX.md`** (albero
`src/`, tabella "Dove vivo X?", indice server actions, moduli cross-cutting,
scelte architetturali). Deep-dive solo quando servono:
`docs/architecture/data-flows.md` (flussi end-to-end) e
`docs/architecture/config-manifest.md` (soglie/limiti/gate). Le skill sono
_prescrittive_ (come fare X); la mappa è _descrittiva_ (dove sta X).

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
7.  **Aggiorna autonomamente `CLAUDE.md` o la skill pertinente** dopo aver
    risolto un problema non triviale con lezione riusabile (debugging pattern,
    setup gotcha, wrong assumption) — senza aspettare che lo chiedano.
8.  **Contenuti marketing & SEO → skill `marketing-content`.** MAI promettere
    feature non live (condizionale/roadmap, mai al presente); se cambi
    label/menu/stati/gating aggiorna i contenuti nello stesso task (grep
    checklist nella skill); slug separati `/help` vs `/guide`; review umana.
9.  **Boundary delle API:** `isValidUuid()` + 400 prima del service;
    `readJsonWithLimit(req, maxBytes)` + 413 prima di `JSON.parse`;
    `normalizeEmail()` (`validation.ts`) come prima riga di ogni auth action.
10. **Wrap SDK esterni (Stripe, AdE, Resend) in try-catch** con log strutturato
    e response 503 — mai lasciare propagare 500 senza context.
11. **DB migrations: TUTTE handwritten dopo `0000`.** 🚫 MAI eseguire
    `npx drizzle-kit generate` (un hook PreToolUse lo blocca). Workflow →
    skill `db-migrations`.
12. **Debug CI failure opachi:** se SonarCloud/Gitleaks flagga qualcosa non
    visibile nel diff/log, chiedere all'utente file/riga — no blind fix.
13. **Debug produzione HTTP (AdE 4xx, ecc.):** diagnostic logging prima del
    fix, riprodurre locale, confermare la root cause. Mai mergiare ipotesi.
14. **HAR analysis:** verificare che **ogni request** in HAR sia presente
    nell'implementazione, non solo l'ordine. Cross-reference one-by-one.
15. **Link auth da marketing → app:** da `(marketing)/*` i link a
    `/login`/`/register`/`/reset-password` usano `appHref()` + plain `<a>`,
    MAI `<Link>` di Next; `appHref()` è server-only: calcola l'href nel parent
    server component e passalo come prop → skill `react-patterns`.
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
19. **Server action di lettura: degradare, non lanciare.** Ritorna `{ error }`
    su fallimento DB/SDK, MAI propagare: il throw sostituisce il fallback
    inline con l'error boundary di Next, rompendo la performance percepita.
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
26. **Mappa codebase: tienila viva.** Se sposti/rinomini un modulo, cambi un
    data flow o una soglia, aggiorna `docs/architecture/*` nello stesso PR
    (una mappa obsoleta è peggio di nessuna mappa). Il validatore
    `scripts/check-architecture-docs.mjs` (arch:check — gira anche come hook
    dopo ogni edit ai doc meta) fallisce sui path morti; il contratto di
    citazione è nell'header dello script.
27. **Date derivate e fonti di verità esterne (bonus/crediti).** Su una data
    DERIVATA asserisci l'esito osservabile user-facing, non lo shift
    intermedio; una grandezza posseduta da Stripe si aggiusta SU Stripe (poi
    il webhook risincronizza), MAI a read-time in locale. Trappole referral →
    skill `stripe-webhooks`, sezione referral/trial.
28. **Niente retrocompatibilità interna.** Un path obsoleto si **rimuove** —
    call site, test, feature flag, colonna morta — mai lo si avvolge in compat
    layer, alias o rami `if (legacy)`. Tre eccezioni non negoziabili: (a) le
    migrazioni SQL già applicate sono immutabili → regola 11; (b) la Developer
    API pubblica `/api/v1` ha consumer esterni: breaking change solo con nuovo
    path di versione (`DEVELOPER.md`); (c) i fallback di resilienza runtime
    (degrado su errore, regola 19) **non** sono compat layer. Rimozione > 3
    file → sub-task (regola 5).
29. **Prima le dipendenze già in progetto.** Prima di scrivere un helper o
    aggiungere un package, verifica docs e **types di ciò che è già
    installato** — mai assumere che una libreria non sappia fare X. Se serve
    davvero qualcosa di nuovo, una libreria mantenuta batte la
    reimplementazione, ma pesala contro "dipendenze minime, un solo container"
    (Principi guida).
30. **Config webpack-only sotto Turbopack: verifica il bundle, non il
    sorgente.** Buildiamo con **Turbopack** (default Next 16): ogni plugin o
    config-file che il vendor inietta solo dal path webpack **non gira**, e
    quasi sempre **senza errori** — il build resta verde e la feature è morta
    in produzione. Già successo due volte: `withSerwistInit` (SW 404, REVIEW
    #84) e `sentry.client.config.ts` (`beforeSend` + Session Replay mai
    caricati, SCONTRINOZERO-V; il client Sentry si configura **solo** in
    `instrumentation-client.ts`). Prima di dichiarare live una config di
    bundling, cerca una stringa che esiste solo nel tuo codice dentro i chunk
    serviti (`.next/static/chunks/` o quelli scaricati da prod) — il sorgente
    non è prova. Procedura → skill `sentry-hygiene` (client) e `pwa-serwist`
    (service worker).

## SonarCloud quality gate

Coverage on new code ≥ **80%** · duplicated lines < **3%** · **0 new issues**
(fix sempre, anche con gate verde). Regole ricorrenti (S6861, S6772, S7780,
S5852/S5122, Gitleaks placeholder) → skill `sonar-quality-gate`.

Stripe API `2026-07-29.dahlia` (breaking changes, 8 webhook events,
referral/trial) → skill `stripe-webhooks`.

## Workflow operativi

### Nuova migrazione DB → skill `db-migrations`

Workflow in 5 step (`.sql` handwritten + `_journal.json` + schema Drizzle +
check + `npx tsx scripts/migrate.ts` idempotente), `ADD COLUMN IF NOT EXISTS`
e bootstrap su DB pre-esistente: skill `db-migrations` (regola 11 sempre).

### Worktree setup (`.claude/worktrees/<name>/`)

- `npm install` (no `node_modules` symlink)
- Copy `.env.local` dalla root del main repo
- `rm -rf .next` in worktree E main repo prima del dev server (evita stale
  Turbopack chunks)

### Pre-PR

```bash
npm run lint                # ESLint (NON esegue tsc)
npm run type-check          # tsc --noEmit — job CI separato, fallisce PRIMA dei test
npx prettier --check src/   # ⚠️ dopo modifiche a classi Tailwind: prettier --write
npm run test:coverage       # tutti i test verdi, coverage non in calo
npm run arch:check          # riferimenti a path e skill in docs/architecture/, .claude/skills/ e CLAUDE.md ancora vivi
npm run migrations:check    # solo se hai toccato supabase/migrations/
```

Controlli manuali:

- [ ] Ogni `it()`/`test()` ha almeno un `expect()` (S6661 Blocker)
- [ ] Mock di classi usano `function`/`class` (non arrow)
- [ ] Variabili in `vi.mock` factory iniziano con `mock` (hoisting Vitest)
- [ ] Nessuna nuova issue SonarCloud Blocker/Critical

### Deploy e T&C → skill `deploy-release`

Tag-based prod/sandbox, push-based dev (Raspberry Pi), build-arg
`NEXT_PUBLIC_*` baked vs runtime, pairing widget Turnstile `:dev`, smoke
post-deploy, procedura T&C/Privacy: skill `deploy-release`.

## Pricing (per plan-gate nel codice)

| Piano       | Mensile | Annuale | Note                                                                                                                    |
| ----------- | ------- | ------- | ----------------------------------------------------------------------------------------------------------------------- |
| Starter     | €4.99   | €29.99  | Catalogo rapido max 5 prodotti, analytics base                                                                          |
| Pro         | €8.99   | €49.99  | Attivo: catalogo ∞, supporto prioritario, analytics avanzata, export CSV. In arrivo: recupero documenti commerciali AdE |
| Self-hosted | €0      | €0      | Tutte le feature, gestione autonoma                                                                                     |
| Unlimited   | —       | —       | Invite-only, `plan='unlimited'` su `profiles`                                                                           |

Feature gate canonico in `src/lib/plans.ts`. Trial 30 giorni Starter/Pro, no
carta all'iscrizione. P.IVA UNIQUE nel DB (anti-abuso trial).

## Skill dominio-specifiche (`.claude/skills/`)

Si auto-attivano quando il task matcha la `description` (non serve elencarle
qui: il harness le inietta già): `ade-integration`, `db-migrations`,
`deploy-release`, `marketing-content`, `money-rounding`, `playwright-verify`,
`pwa-serwist`, `react-patterns`, `security-patterns`, `sentry-hygiene`,
`sonar-quality-gate`, `stripe-webhooks`, `testing-patterns`.

Questo elenco è **verificato da `npm run arch:check`**: una skill nuova non
citata qui fa fallire il check, e ogni citazione nella forma
skill `<nome>` — in CLAUDE.md, nelle skill e in `docs/architecture/` — deve
risolvere a una directory esistente sotto `.claude/skills`.

## Hook automatici (`.claude/hooks/`)

- `.claude/hooks/block-drizzle-generate.sh` — blocca `drizzle-kit generate`
  (regola 11)
- `.claude/hooks/block-push-to-main.sh` — blocca `git push` verso `main`
  (regola 1)
- `.claude/hooks/block-commit-on-main.sh` — blocca `git commit` sul branch
  `main` (regola 1)
- `.claude/hooks/check-arch-docs-on-edit.sh` — esegue arch:check dopo ogni edit
  ai doc meta (regola 26)

Ogni hook ha la sua suite (`.claude/hooks/test-*.sh`), eseguita in CI dal job
`hook-tests` quando cambia `.claude/hooks/`.
