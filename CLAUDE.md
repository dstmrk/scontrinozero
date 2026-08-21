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
`docs/api-spec.md` · finding misurati sui tracciati HAR del portale AdE
`HAR.md` (voci numerate: gli `.har` sono gitignorati, quel file è la loro
traduzione permanente) · overview pubblico `README.md` · release dai tag git.

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
`docs/architecture/data-flows.md` (flussi end-to-end),
`docs/architecture/config-manifest.md` (soglie/limiti/gate) e
`docs/architecture/rules-registry.md` (indice `regola N` → owner). Le skill
sono _prescrittive_ (come fare X); la mappa è _descrittiva_ (dove sta X).

## Regole sempre-attive (applicano a ogni task)

Dodici. Stanno qui perché servono **prima** che tu sappia di averne bisogno:
nessuna skill si auto-attiva in tempo per salvarti. Tutto il resto è nel
**registro** sotto — una riga per regola, prosa completa nella skill che la
possiede. La numerazione è **stabile e non si ricicla**: il codice cita
`regola N` in centinaia di punti, quindi un numero assente da questa lista non
è stato abolito, è stato spostato nel registro.

- **1 · Branch separato sempre.** Mai commit/push diretti su `main`. PR sempre,
  merge spetta all'utente (a meno che non chiesto esplicito).
- **2 · TDD.** Test prima dell'implementazione. Ogni file con logica ha il suo
  test file (anche `instrumentation.ts` e simili bootstrap).
- **3 · Ambiguità: proponi, non chiedere a vuoto.** Una domanda aperta ("come lo
  vuoi?") scarica sull'utente il lavoro di immaginare la risposta. Presenta 2-3
  opzioni concrete con la **tua risposta consigliata** e il trade-off in una
  riga: si accetta, si scarta o si corregge. Una domanda alla volta. E non
  chiedere ciò a cui il repo sa già rispondere — quello si legge.
- **4 · Edge case dopo ogni implementazione:** elencare gli edge case e
  aggiungere test che li coprono prima di committare.
- **5 · Una slice = un contratto verificabile da solo.** Non conta il numero di
  file toccati (un rename ne tocca 12 ed è una slice sola; due file possono
  nascondere tre decisioni architetturali): conta se il pezzo si accetta o si
  rifiuta guardando **un solo artefatto** — un test, una schermata, una probe.
  Il criterio di uscita è il **decision budget**: la slice è pronta quando chi
  implementa _eredita_ le decisioni invece di inventarle. Ogni libertà lasciata
  aperta o è dichiarata delegata, o è un buco nella spec, e finisce nel ledger
  (regola 32). Se implementando la slice inizi a cambiare variabili non
  correlate, **fermati e ri-affetta**. Ri-affettare non è tornare indietro: è
  la slice che ti sta dicendo di essere due.
- **7 · La lezione va nella skill, poi nel gate.** Dopo aver risolto un problema
  non triviale con lezione riusabile (debugging pattern, setup gotcha,
  assunzione sbagliata) scrivila **subito**, senza aspettare che te lo chiedano
  — e scrivila nella **skill** che possiede il dominio, non qui: in `CLAUDE.md`
  entra solo ciò che serve prima che una skill possa attivarsi. Vale anche
  quando l'utente ti corregge: capire _perché_ hai sbagliato è parte del fix.
  Poi il passo che chiude il ciclo. Una regola scritta in prosa è un promemoria
  che paghi in contesto a ogni task, quindi **falla convergere verso un hook o
  un test**; quando il gate esiste, togli la prosa e cita il gate. È così che
  11, 26, 30 e 31 sono uscite da questa lista.
- **9 · Boundary delle API:** `isValidUuid()` + 400 prima del service;
  `readJsonWithLimit(req, maxBytes)` + 413 prima di `JSON.parse`;
  `normalizeEmail()` (`validation.ts`) come prima riga di ogni auth action.
- **19 · Server action di lettura: degradare, non lanciare.** Ritorna
  `{ error }` su fallimento DB/SDK, MAI propagare: il throw sostituisce il
  fallback inline con l'error boundary di Next, rompendo la performance
  percepita.
- **20 · Errori d'input utente: warn, non error (no Sentry noise).** Condizioni
  prevedibili dall'input (credenziali AdE sbagliate, P.IVA già registrata,
  Turnstile scaduto) → `logger.warn`, MAI issue Sentry. Pattern
  `logAdeFailure()` + filtri client → skill `sentry-hygiene`.
- **28 · Niente retrocompatibilità interna.** Un path obsoleto si **rimuove** —
  call site, test, feature flag, colonna morta — mai lo si avvolge in compat
  layer, alias o rami `if (legacy)`. Tre eccezioni non negoziabili: (a) le
  migrazioni SQL già applicate sono immutabili → regola 11; (b) la Developer
  API pubblica `/api/v1` ha consumer esterni: breaking change solo con nuovo
  path di versione (`DEVELOPER.md`); (c) i fallback di resilienza runtime
  (degrado su errore, regola 19) **non** sono compat layer. Una rimozione che
  smette di essere verificabile da sola si ri-affetta (regola 5).
- **29 · Prima le dipendenze già in progetto.** Prima di scrivere un helper o
  aggiungere un package, verifica docs e **types di ciò che è già installato** —
  mai assumere che una libreria non sappia fare X. Se serve davvero qualcosa di
  nuovo, una libreria mantenuta batte la reimplementazione, ma pesala contro
  "dipendenze minime, un solo container" (Principi guida).
- **32 · Consegna il ledger delle decisioni, non il diff.** Leggere il diff riga
  per riga non regge il ritmo con cui il codice viene prodotto, e una review che
  non regge il ritmo diventa una firma. **Nel corpo della PR, prima del merge**
  (il repo mergia in squash: quel testo diventa il messaggio di commit, quindi
  storia git immutabile) consegni **(a)** le decisioni prese dove il prompt o
  la spec tacevano — scenario in italiano leggibile, cosa non era specificato,
  verdetto, confidence — ordinate dalla **meno** confidente alla più; e **(b)**
  il costo: righe aggiunte/tolte divise per codice di produzione, commenti,
  test e doc, più le **superfici strutturali** nuove (colonna, indice,
  endpoint, cron, flag, dipendenza). Una grossa aggiunta netta per un cambio di
  comportamento piccolo è un finding da dichiarare, non un numero da
  seppellire. L'audit non modifica codice. Formato e template → skill
  `decision-ledger`.

### Le altre regole (6, 8, 10-18, 21-27, 30, 31)

Non sono state abolite: la prosa vive nella **skill** o nel **gate** che le
possiede, e lì si attiva da sola quando lavori in quel dominio. L'indice
`regola N` → owner, per risolvere una citazione che trovi nel codice, è in
`docs/architecture/rules-registry.md`.

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

Poi tre lenti, **in quest'ordine**:

1. **Forma** — rifattorizza finché il codice è fresco e cambiarlo costa poco:
   shim da dev, concetti duplicati, astrazioni parallele, wrapper di compat
   introdotti da questo lavoro collassano in un contratto solo (regola 28).
2. **Diff** — solo ora rileggi il diff in modo avversariale, su codice ormai
   stabile. Se una fix qui riapre la forma, **torni alla lente 1**: si chiude
   quando un passaggio completo non trova più nulla.
3. **Doc** — `docs/architecture/` (regola 26), la skill che ha imparato
   qualcosa (regola 7), `REVIEW.md` se resta un finding aperto.

Infine il **ledger delle decisioni + la tabella del costo** (regola 32), nel
corpo della PR: è quello che l'utente legge, non il diff. Il repo mergia in
squash, quindi titolo e corpo della PR diventano il messaggio di commit —
titolo con prefisso conventional-commit in italiano, corpo scritto pulito, ed
entrambi finiti **prima** del merge. Formato → skill `decision-ledger`.

> Le trappole che i comandi sopra non catturano — S6661, mock di classi con
> `function`/`class`, prefisso `mock` nei factory `vi.mock` — vivono nelle
> skill `testing-patterns` e `sonar-quality-gate`, non qui: erano una checklist
> manuale che nessun gate applicava. Farle diventare regole ESLint è tracciato
> in `REVIEW.md`.

### Deploy e T&C → skill `deploy-release`

Tag-based prod/sandbox, push-based dev (Raspberry Pi), build-arg
`NEXT_PUBLIC_*` baked vs runtime, pairing widget Turnstile `:dev`, smoke
post-deploy, procedura T&C/Privacy: skill `deploy-release`.

## Pricing (per plan-gate nel codice)

| Piano       | Mensile | Annuale | Note                                                                                                                                                                                           |
| ----------- | ------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Starter     | €4.99   | €29.99  | Catalogo rapido max 5 prodotti, analytics base                                                                                                                                                 |
| Pro         | €8.99   | €49.99  | Attivo: catalogo ∞, supporto prioritario, analytics avanzata, export CSV, messaggio personalizzato sullo scontrino, sconti (di riga e a pagare). In arrivo: recupero documenti commerciali AdE |
| Self-hosted | €0      | €0      | Tutte le feature, gestione autonoma                                                                                                                                                            |
| Unlimited   | —       | —       | Invite-only, `plan='unlimited'` su `profiles`                                                                                                                                                  |

Feature gate canonico in `src/lib/plans.ts`. Trial 30 giorni Starter/Pro, no
carta all'iscrizione: include le feature Pro visibili **e** la Developer API
(1 chiave, contro le 3 di Pro). P.IVA UNIQUE nel DB (anti-abuso trial).

## Skill dominio-specifiche (`.claude/skills/`)

Si auto-attivano quando il task matcha la `description` (non serve elencarle
qui: il harness le inietta già): `ade-integration`, `db-migrations`,
`decision-ledger`, `deploy-release`, `marketing-content`, `money-rounding`,
`playwright-verify`, `pwa-serwist`, `react-patterns`, `security-patterns`,
`sentry-hygiene`, `sonar-quality-gate`, `stripe-webhooks`, `testing-patterns`.

Sono anche la **destinazione** delle regole non sempre-attive (regola 7): la
prosa di dominio vive qui, non in `CLAUDE.md`.

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
