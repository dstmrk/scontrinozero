# CLAUDE.md — ScontrinoZero

## General Rules for Claude

1. **Commit/push sempre su branch separato, mai su `main` direttamente.**
   Dopo aver completato il lavoro: crea un branch, committa, pusha, apri una PR.
   Non fare mai merge autonomamente — il merge spetta all'utente, a meno che non
   venga chiesto esplicitamente.

2. We are using a TDD approach

3. If the requirements I give you are ambiguous, ask clarifying questions before writing any code.

4. After you finish writing any code, list the edge cases and add test cases to cover them as well.

5. If a task requires changes to more than 3 files, stop and break it into smaller tasks first.

6. Every time I correct you, reflect on what you did wrong and come up with a plan to never make the same mistake again.

7. Every new file with logic **must** have a corresponding test file. After writing any implementation, always write tests covering the edge cases before committing. No exceptions — even for infrastructure/bootstrap files (e.g. `instrumentation.ts`).

8. **SonarCloud quality gates (must not regress):**
   - Coverage on new code: **≥ 80%**
   - Duplicated lines on new code: **< 3%**
   - **0 new issues**: fix every SonarCloud issue before merging, even when the Quality Gate passes. Issues left open accumulate into tech debt and will block future PRs.
   - Common quick fixes: Cognitive Complexity > 15 → extract helper functions; optional chain suggestions → replace `!x || x.prop` with `x?.prop`.
   - If a file has no testable logic (pure config, UI shell), add it to `sonar.coverage.exclusions` in `sonar-project.properties` AND to the `exclude` list in `vitest.config.ts` — never leave it untested without explicitly excluding it.
   - **Service worker files (`src/sw.ts`) must be added to `sonar.exclusions`** (not just `sonar.coverage.exclusions`). They use WebWorker-specific globals (`ServiceWorkerGlobalScope`, `declare const self`) that conflict with the DOM lib and trigger SonarCloud false positives (variable shadowing). Also add to `tsconfig.json` exclude for the same reason.
   - **Common SonarCloud style rules to anticipate**: `typeof x === "undefined"` → `x === undefined`; `window.*` → `globalThis.window.*` (es2020 portability); `<div role="banner">` → `<header>`; async functions as onClick → `onClick={() => void asyncFn()}`.
   - **`// NOSONAR` does NOT suppress Security Hotspots** — it only suppresses Issues (Bug/CodeSmell/Vulnerability). Hotspots require either fixing the code so the rule no longer fires, or human review via the SonarCloud UI ("Mark as Safe"). For S5852 (ReDoS): replace regex with Set-based char loop + manual pointer trimming. For S5122 (CORS `*`): `// NOSONAR` is ineffective — the user must acknowledge in SonarCloud UI, or remove the wildcard.

9. **After solving a non-trivial problem, update CLAUDE.md autonomously.**
   When a task is complete (bug fixed, feature shipped), reflect on what went wrong
   or could have gone faster. If there's a reusable lesson — a debugging pattern,
   a setup gotcha, a wrong assumption — add it to CLAUDE.md before committing.
   Don't wait for the user to ask.

10. **Debugging production HTTP flow errors (e.g. AdE 4xx): diagnose before fixing.**
    When a production error suggests a wrong HTTP sequence, add diagnostic logging first
    (phase labels, cookie counts, response status) and reproduce the error locally to
    confirm the root cause. Only then write the fix. Never merge a hypothesis-based
    fix without first seeing the diagnostic evidence.

11. **HAR analysis: verify completeness, not just order.**
    When comparing code against a HAR capture, explicitly check that **every request**
    in the HAR is present in the implementation — not just that the order matches.
    A missing call is harder to spot than a wrong order. Go through the HAR
    request-by-request and cross-reference each one with the corresponding code path.

12. **Git worktree setup checklist.**
    When working in a worktree under `.claude/worktrees/<name>/`:
    - Run `npm install` (no `node_modules` symlink from main repo)
    - Copy `.env.local` from the main repo root
    - Delete `.next` in both the worktree AND the main repo (`rm -rf .next`) before
      starting the dev server to avoid Turbopack serving stale cached chunks

13. **DB migrations: workflow misto drizzle-kit + SQL handwritten.**
    Le migrazioni seguono un approccio ibrido obbligato:
    - **Schema changes** (tabelle, colonne, indici, FK) → `npx drizzle-kit generate`
      aggiorna automaticamente sia il file `.sql` sia il `_journal.json`.
    - **RLS policies, trigger, funzioni PL/pgSQL** → non esprimibili nello schema Drizzle,
      vanno scritte come file SQL a mano (es. `0005_api_keys_rls.sql`).

    Il runtime usa un **file-based runner** (`scripts/migrate.ts`) invece di Drizzle's
    built-in `migrate()`, proprio per gestire i file handwritten senza overhead manuale:
    legge tutti i `.sql` da `supabase/migrations/` ordinati per nome, traccia i file
    già applicati nella tabella `__applied_migrations`, e wrappa ogni migrazione in una
    transazione. **Per aggiungere una migrazione handwritten: crea il file `.sql` E aggiungi
    la entry corrispondente in `supabase/migrations/meta/_journal.json`** (incrementa `idx`,
    usa timestamp Unix in ms, tag = nome file senza `.sql`). Il runtime runner non ne ha
    bisogno, ma il CI script `check-migrations.mjs` valida che ogni `.sql` sia registrato.
    - File naming: `NNNN_description.sql` (es. `0007_add_new_table.sql`)
    - Il `check-migrations.mjs` CI script valida i file SQL contro il journal per
      compatibilità drizzle-kit — è separato dal runtime runner.
    - **Bootstrap su DB pre-esistente**: se il DB è stato inizializzato senza il
      migration runner (via drizzle-kit, Supabase dashboard, restore), la tabella
      `__applied_migrations` è vuota e il runner crasherà con "type already exists".
      Il runner ha rilevamento automatico: se `__applied_migrations` è vuota ma il
      tipo `document_kind` esiste già in `pg_type`, segna tutte le migrazioni come
      applicate senza rieseguirle. Fix manuale di emergenza (se il runner non parte):
      ```sql
      INSERT INTO __applied_migrations (filename, checksum)
      SELECT unnest(ARRAY[
        '0000_initial.sql','0001_rls_policies.sql','0002_add_lottery_code.sql',
        '0003_remove_unused_columns.sql','0004_add_api_keys.sql',
        '0005_api_keys_rls.sql','0006_add_api_key_id_to_documents.sql',
        '0007_add_voided_document_id.sql','0008_unique_email_profiles.sql',
        '0009_idempotency_per_business.sql','0010_api_keys_constraints.sql'
      ]), '' ON CONFLICT (filename) DO NOTHING;
      ```
      (aggiornare la lista se ci sono migrazioni più recenti)
      ⚠️ **L'INSERT manuale va fatto SOLO per le migrazioni già effettivamente presenti
      nel DB.** Inserire filename di migrazioni non eseguite le marca come applicate
      senza eseguirle — schema silenziosamente incompleto. Per verificare quali
      migrazioni sono realmente presenti prima di inserirle, controllare l'esistenza
      delle tabelle/colonne chiave nel Supabase SQL editor o via MCP.

14. **Client IP trust model: CF-Connecting-IP is the ONLY trusted source.**
    When the app is behind Cloudflare Tunnel, `CF-Connecting-IP` is the only header
    that Cloudflare sets and clients cannot spoof. Follow this priority in `getClientIp()`:
    1. `CF-Connecting-IP` — always trusted (Cloudflare strips incoming copies)
    2. `X-Forwarded-For` — dev/test fallback only; **explicitly comment** that it is
       non-trusted outside Cloudflare
    3. `X-Real-IP` — **drop entirely** (non-standard, no trust model)
       Never silently fall through a chain of headers without documenting why each one is
       or isn't trusted. Rate limiting built on a spoofable IP is no rate limiting at all.

15. **Transaction safety for multi-document state changes is correctness, not optimization.**
    Whenever an operation must update 2+ related DB records that must stay consistent
    (e.g., void flow: write VOID document + mark original SALE as VOID_ACCEPTED),
    wrap them in `db.transaction()` immediately. A mid-operation failure without a
    transaction leaves the system in a silently inconsistent state that is hard to detect
    and painful to repair. Don't defer this to "a later optimization sprint".

16. **Retry + backoff for critical operations that leave orphan state on failure.**
    Operations that (a) are irreversible on partial success, (b) can fail transiently
    (network blip, external service timeout), and (c) leave the system inconsistent on
    failure (e.g., Supabase auth user deletion leaving an orphan entry that blocks
    re-registration) must have:
    - 3 retry attempts with exponential backoff (500 ms → 1 s → 2 s)
    - `logger.error({ critical: true }, …)` after all retries are exhausted
    - A comment documenting what **manual cleanup** is required if retries fail
      Silent failure here is worse than a visible error: the user is permanently blocked
      with no actionable signal.

17. **UUID validation at external API entry points — before the service layer.**
    Every external-facing API route that accepts a UUID parameter (e.g., `idempotencyKey`,
    `receiptId`) must validate the format with `isValidUuid()` and return 400 **before**
    passing to any service or DB layer. Non-UUID strings passed to PostgreSQL UUID columns
    produce unhandled 500 errors that bypass all application error handling.
    UUID validation belongs at the route handler boundary, not inside the service.

18. **Validate hostname of Supabase-generated action links before emailing them.**
    Before emailing any Supabase-generated link (password reset, magic link, email change),
    assert that the URL starts with `https://${expectedHostname}`. Supabase misconfiguration
    (wrong Site URL setting) can produce links pointing to unexpected domains, enabling open
    redirect attacks. If the check fails: log an error, do NOT send the email, and redirect
    the user to `/verify-email` with a generic message.

## Progetto

ScontrinoZero è un registratore di cassa virtuale (SaaS) mobile-first che consente a
esercenti e micro-attività di emettere scontrini elettronici e trasmettere i corrispettivi
all'Agenzia delle Entrate senza registratore telematico fisico, sfruttando la procedura
"Documento Commerciale Online".

**Versione corrente:** v1.1.3 ✅ (rilasciato in produzione) — roadmap completa in `PLAN.md`.

**Prossima release:** v1.2.0 (PWA)

**Post-lancio:** v1.2.0 (PWA) → v1.3.0 (landing SEO) → v1.4.0+ (analytics, catalog sync, …)

## Principi di prodotto

### Performance percepita come priorità #1

L'obiettivo è che ogni interazione si senta **istantanea**. L'emissione di uno scontrino
deve sembrare immediata anche se il portale AdE risponde in 2-5 secondi.

Tecniche:

- **Optimistic UI** — TanStack Query mutations: lo scontrino appare come "emesso"
  immediatamente, il backend completa la trasmissione AdE in background.
  Rollback automatico se l'invio fallisce.
- **Skeleton loading** — mai schermi bianchi, sempre placeholder animati
- **Route prefetching** — Next.js prefetch dei link visibili nel viewport
- **Stale-while-revalidate** — TanStack Query mostra dati cached istantaneamente,
  aggiorna in background
- **Transizioni fluide** — no full-page reload, animazioni CSS minimali ma percettibili
- **SSG per marketing** — pagine statiche pre-renderizzate, TTFB quasi zero
- **Service worker** — shell PWA in cache, navigazione offline-first

### Hobby project → il più economico del mercato

Questo è un progetto hobby con costi fissi ~€0. Nessun dipendente, nessuna API terze
parti a pagamento, VPS già pagata. Il costo marginale per utente è praticamente zero.
Questo permette un pricing aggressivo impossibile per i competitor.

### Leggeri sulle risorse

La VPS ha risorse limitate. Ogni dipendenza, ogni libreria, ogni processo deve
giustificare la propria esistenza.

- **No headless browser** — niente Playwright, Puppeteer o Chromium in produzione.
  L'integrazione AdE usa esclusivamente chiamate HTTP dirette (fetch/axios).
  La generazione PDF usa **pdfkit** (Node.js puro, ~500KB), coerente con questo vincolo.
  ⚠️ pdfkit richiede `serverExternalPackages: ["pdfkit"]` in `next.config.ts` per evitare
  che Turbopack riscriva `__dirname` in `/ROOT` e rompa la risoluzione dei font AFM.
- **Dipendenze minime** — aggiungere librerie solo quando strettamente necessario.
  Preferire soluzioni native o leggere.
- **Next.js standalone** — output ottimizzato, solo i file necessari (~100MB vs ~1GB)
- **Docker slim** — immagine base leggera, no tool di sviluppo nel container
- **Un solo container** — next-app + cloudflared, niente orchestrazione complessa

### Open source + SaaS (O'Saasy License)

- **Self-hosted gratis** — chiunque può scaricare, installare e usare il software
  sul proprio server senza pagare nulla
- **Versione hosted a pagamento** — noi offriamo il servizio gestito (SaaS) con
  hosting, aggiornamenti, backup, supporto
- **O'Saasy License** — permissiva come MIT, ma vieta di usare il software per
  offrire un SaaS concorrente
- La versione self-hosted è un selling point di fiducia: le credenziali Fisconline
  restano sul server dell'utente, nessun dato transita da terzi

### Pricing: i meno cari del mercato

| Piano           | Mensile | Annuale | Target                    | Feature principali                               |
| --------------- | ------- | ------- | ------------------------- | ------------------------------------------------ |
| **Starter**     | €4.99   | €29.99  | Micro-attività, ambulanti | Scontrini illimitati, catalogo 5 prodotti        |
| **Pro**         | €8.99   | €49.99  | Negozi, attività regolari | Catalogo illimitato, analytics, export, AdE sync |
| **Self-hosted** | €0      | €0      | Tecnici, smanettoni       | Tutte le feature, gestione autonoma              |
| **Unlimited**   | —       | —       | Invite-only (amici/beta)  | Come Pro, gestito direttamente su DB             |

**Strategia pricing:**

- Nessun piano Free hosted — solo self-hosted gratuito
- **Trial 30 giorni** per Starter e Pro: nessuna carta di credito all'iscrizione,
  scelta piano + CC solo alla scadenza del trial. Se non aggiunge CC: sola lettura.
- Starter annuale (€29.99) è il prezzo più basso del mercato (competitor: Scontrinare €30/anno)
- Starter mensile (€4.99) serve come ancora per far sembrare Pro un affare (decoy effect)
- Pro annuale (€49.99) salva il 54% vs mensile; Starter annuale (€29.99) salva il 50% — Pro è più conveniente in percentuale
- **Anti-abuso trial**: P.IVA UNIQUE nel DB — impedisce trial multipli anche con email diverse

**Differenziazione piani (feature gate):**

| Feature                        | Starter | Pro |
| ------------------------------ | ------- | --- |
| Scontrini illimitati           | ✅      | ✅  |
| Metodi pagamento misti         | ✅      | ✅  |
| Max prodotti catalogo rapido   | 5       | ∞   |
| Analytics base                 | ✅      | ✅  |
| Analytics avanzata (dashboard) | ❌      | ✅  |
| Export CSV scontrini           | ❌      | ✅  |
| Recupero corrispettivi da AdE  | ❌      | ✅  |
| Sync catalogo da AdE           | ❌      | ✅  |
| Supporto prioritario           | ❌      | ✅  |

**Piano Unlimited (invite-only):** inserito direttamente nel DB (`plan = 'unlimited'` su `profiles`),
nessuna logica Stripe. Bypassa tutti i gate come Pro.

## Tech Stack

### Frontend

| Tecnologia                  | Ruolo                      | Note                                       |
| --------------------------- | -------------------------- | ------------------------------------------ |
| **Next.js 16** (App Router) | Framework React full-stack | SSR/SSG, API routes, server actions        |
| **React 19**                | UI library                 |                                            |
| **TypeScript**              | Type safety                | Strict mode                                |
| **Tailwind CSS 4**          | Styling utility-first      |                                            |
| **shadcn/ui**               | Component library          | Copy-paste, customizzabile, Radix UI sotto |
| **TanStack Query v5**       | Data fetching client-side  | Cache, mutations, optimistic updates       |
| **TanStack Table**          | Tabelle dati               | Già integrato in shadcn/ui DataTable       |
| **PWA** (@serwist/next)     | Mobile-first installabile  | Service worker, offline shell, manifest    |

### Backend

| Tecnologia                              | Ruolo             | Note                                           |
| --------------------------------------- | ----------------- | ---------------------------------------------- |
| **Next.js API Routes + Server Actions** | Backend primario  | Integrato nel monolite Next.js                 |
| **Supabase Cloud**                      | BaaS (PostgreSQL) | DB, auth, storage — free tier (50k MAU, 500MB) |

### Database

- **PostgreSQL** via Supabase Cloud (free tier per iniziare, poi Pro $25/mese)
- **Drizzle ORM** — type-safe, leggero, ottima DX con TypeScript
- **Row Level Security (RLS)** — sicurezza a livello di riga per multi-tenancy

### Autenticazione

- **Supabase Auth** — email/password per il login all'app SaaS
- SPID è usato solo per autenticazione sul portale AdE (non come metodo di login all'app)

### Integrazione Agenzia delle Entrate

L'AdE **non espone API REST pubbliche**. La procedura "Documento Commerciale Online"
è un'interfaccia web nel portale Fatture e Corrispettivi.

**Strategia: integrazione diretta** (no API terze parti, no headless browser):

- Reverse-engineering delle chiamate HTTP che il portale AdE effettua internamente
- L'utente fornisce le proprie credenziali Fisconline (cifrate, mai in chiaro)
- Il backend replica il flusso con chiamate HTTP dirette (fetch/axios)
- **NO Playwright/headless browser** — troppo pesante per una VPS limitata
  (~400MB RAM per Chromium). Solo chiamate HTTP leggere.
- Base legale: Interpello AdE n. 956-1523/2020 — l'AdE non si oppone ai
  "velocizzatori" purché rispettino le prescrizioni normative

### Pagamenti SaaS (subscription)

- **Stripe** — fee più basse in EU (1.5% + €0.25 per carte europee)
- SDK: `stripe` npm v20.4.1, API version `2026-02-25.clover`

**⚠️ Attenzione API version 2026-02-25.clover (breaking changes rispetto alle versioni precedenti):**

- `Invoice.subscription` **rimosso** → usare `invoice.parent?.subscription_details?.subscription`
- `Subscription.current_period_end` **spostato** a livello item → `subscription.items.data[0]?.current_period_end`
- Non usare `!` (non-null assertion) su `process.env.STRIPE_WEBHOOK_SECRET` — aggiungere
  un guard esplicito (`if (!secret) return 500`) per evitare SonarCloud code smell

### Email transazionali

- **Resend** — email transazionali (welcome, password reset, account deletion)
- Free tier: 3.000 email/mese; Pro $20/mese per 50k quando si scala
- React Email per template type-safe nello stesso stack
- **Welcome email**: inviata al completamento dell'onboarding (step finale), **non** al signUp —
  evita email a utenti che abbandonano il wizard prima di completarlo

### Deployment

- **Docker self-hosted su VPS** — Next.js `standalone`, Cloudflare Tunnel come ingress
  - HTTPS automatico, CDN, DDoS protection, IP nascosto — zero porte pubbliche
  - Docker Compose: next-app + cloudflared
  - Health check endpoint: `/api/health`
  - `start-period` healthcheck: **60s** (tempo per completare le migrazioni DB al primo avvio)
- **Supabase Cloud** per il database (no DB da gestire sulla VPS)
- **Deploy manuale via tag** `v*.*.*` → GitHub Actions: build Docker → push GHCR → VPS:
  ```bash
  cd /opt/scontrinozero
  docker compose pull && docker compose up -d
  ```
  (VPS accessibile solo via Cloudflare Access SSH)

**⚠️ Variabili `NEXT_PUBLIC_*` nel Docker build:**
Next.js bake le variabili `NEXT_PUBLIC_*` **durante la build**, non a runtime.
Devono essere passate come `--build-arg` al `docker build` (configurato in GitHub Actions via `ARG` nel Dockerfile).
In particolare: `NEXT_PUBLIC_TURNSTILE_SITE_KEY` — se manca al build, Turnstile non funziona in produzione.

### Monitoring, Analytics, Code quality

| Tool                  | Ruolo                               | Note                                                |
| --------------------- | ----------------------------------- | --------------------------------------------------- |
| **Sentry**            | Error tracking + performance        | Free tier: 5k errori/mese; `@sentry/nextjs`         |
| **pino**              | Structured logging                  |                                                     |
| **Umami**             | Web analytics privacy-first         | Self-hosted, GDPR compliant, script ~2KB, no cookie |
| **SonarQube Cloud**   | Analisi statica, SAST, coverage     | Free ≤50k LOC; PR decoration; Quality Gate          |
| **ESLint + Prettier** | Linting e formattazione             | lint-staged + husky sui file staged                 |
| **Dependabot**        | Aggiornamenti dipendenze automatici | Settimanale, patch/minor raggruppati                |

### CI/CD

- **GitHub Actions** — pipeline su push/PR verso main:
  1. Secret scan (Gitleaks, sempre attivo)
  2. Security audit (`audit-ci` `--moderate` con allowlist `audit-ci.json`)
  3. Parallel: lint + type-check, test+coverage (Vitest→lcov), SonarQube scan, build
- **Pipeline Deploy** (tag `v*.*.*`): build Docker → smoke test container → Trivy scan CVE → push GHCR
- **Code review on-demand** (`claude-code-review.yml`): commenta `/claude review` su PR
- **Branch protection**: abilitare "Require status checks" su GitHub Settings → Branches

### Testing

- **Approccio TDD** — test-first: scrivere i test prima dell'implementazione
- **Vitest** — unit e integration test; coverage `@vitest/coverage-v8` (report lcov)
- I componenti shadcn/ui (`src/components/ui/`) sono esclusi dalla coverage
- I componenti marketing (`src/components/marketing/**`) sono esclusi dalla coverage
  (pura UI presentazionale, zero logica di business)

## Ambienti: sandbox e produzione

### Due ambienti sulla stessa VPS

|                   | **Sandbox**                                   | **Produzione**               |
| ----------------- | --------------------------------------------- | ---------------------------- |
| URL               | `sandbox.scontrinozero.it`                    | `scontrinozero.it`           |
| API URL           | `api.sandbox.scontrinozero.it`                | `api.scontrinozero.it`       |
| Cloudflare Tunnel | Route separata verso container sandbox        | Route verso container prod   |
| Docker Compose    | `/opt/scontrinozero-sandbox/`                 | `/opt/scontrinozero/`        |
| DB Supabase       | Progetto Supabase separato (free tier)        | Progetto Supabase principale |
| Variabile         | `ADE_MODE=mock`                               | `ADE_MODE=real`              |
| Stripe            | Stripe test mode (chiavi `sk_test_*`)         | Stripe live mode             |
| Scopo             | Test integrazione API per sviluppatori terzi  | Utenti finali                |

**Nota runtime hostname:** `APP_HOSTNAME` (senza prefisso `NEXT_PUBLIC_`) è una
variabile runtime che sovrascrive il valore baked nell'immagine Docker. Va impostata
a `sandbox.scontrinozero.it` nel `.env` del container sandbox per la validazione
Turnstile e dei link email. Utile anche per installazioni self-hosted su dominio custom.

### Strategia mock AdE per ambiente sandbox

L'integrazione AdE usa un **pattern adapter/strategy**:

- Interfaccia `AdeClient` con metodi: `submitSale()`, `submitVoid()`, etc.
- `RealAdeClient` — invia davvero all'AdE (produzione)
- `MockAdeClient` — esegue **tutta la logica** (validazione, formattazione,
  preparazione payload) ma si ferma prima dell'invio HTTP all'AdE, restituendo
  una risposta simulata
- Controllato da `ADE_MODE=real|mock` (variabile d'ambiente)
- Il codice in sandbox è **identico** a quello in produzione, cambia solo l'ultimo step

### Flusso di rilascio (tag-based)

```
sviluppo su branch → PR → merge su main → CI (test + lint + sonar)
                                              ↓
                              git tag v1.0.0 → GitHub Actions: build + push su GHCR
                                              ↓
                              VPS (browser SSH Cloudflare Access):
                              cd /opt/scontrinozero
                              docker compose pull && docker compose up -d
```

## Linee guida test e qualità

### Regole obbligatorie (evitano failure CI / SonarCloud Blocker)

#### Ogni test deve avere almeno un `expect()`

SonarCloud classifica come **Blocker** qualsiasi `it()`/`test()` senza assertion.
Anche i test che verificano "non lancia eccezione" o "chiama redirect" devono
contenere almeno un `expect()` esplicito.

```typescript
// ❌ SBAGLIATO — SonarCloud Blocker
it("chiama signIn senza errori", async () => {
  try {
    await signIn(formData);
  } catch {
    // redirect expected
  }
});

// ✅ CORRETTO — assertion su effetto osservabile
it("chiama signIn senza errori", async () => {
  try {
    await signIn(formData);
  } catch {
    // redirect expected
  }
  expect(mockSomeFn).toHaveBeenCalled();
});
```

#### `vi.mock` di classi: usare `function` o `class`, mai arrow function

Quando un modulo esporta una **classe** che viene istanziata con `new`,
il mock deve usare la keyword `function` o `class` nel `mockImplementation`.
Le arrow function non possono essere costruttori e causano:
`TypeError: () => ({...}) is not a constructor`.

Le variabili usate nella factory `vi.mock` **devono iniziare con `mock`**
(Vitest le includa nell'hoisting automatico).

```typescript
// ❌ SBAGLIATO — arrow function non è un costruttore
const mockCheck = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  RateLimiter: vi.fn().mockImplementation(() => ({ check: mockCheck })),
}));

// ✅ CORRETTO — regular function restituisce l'oggetto mock
const mockCheck = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  RateLimiter: vi.fn().mockImplementation(function () {
    return { check: mockCheck };
  }),
}));
```

> Nota: variabili nel factory `vi.mock` devono iniziare con `mock` —
> Vitest le issa automaticamente, le altre risultano `undefined`.

### Pattern: rate limiting su server actions autenticate

Le server actions che operano per conto di un utente autenticato usano chiavi **per-user**
(non per-IP). Le azioni pubbliche (PDF pubblici, ecc.) usano chiavi per-IP.

```typescript
// Istanziare a livello di modulo (singleton per processo)
const myLimiter = new RateLimiter({
  maxRequests: 30, // soglia appropriata all'operazione
  windowMs: 60 * 60 * 1000, // finestra di 1 ora
});

export async function myAction(input: MyInput): Promise<MyResult> {
  const user = await getAuthenticatedUser(); // prima cosa sempre

  const rateLimitResult = myLimiter.check(`prefix:${user.id}`);
  if (!rateLimitResult.success) {
    logger.warn({ userId: user.id }, "Rate limit exceeded");
    return { error: "Troppe richieste. Riprova tra qualche minuto." };
  }
  // ... resto della logica
}
```

**Soglie consolidate:**

- `emit:<userId>` — `emitReceipt` → 30/ora (operazione frequente)
- `void:<userId>` — `voidReceipt` → 10/ora (operazione rara e irreversibile)
- `pdf:<ip>` — PDF pubblico → 60/ora (per-IP, non autenticato)
- `checkout:<userId>` — `POST /api/stripe/checkout` → 10/ora
- `portal:<userId>` — `GET|POST /api/stripe/portal` → 10/ora
- Auth actions — 5/15min per-IP (in `src/server/auth-actions.ts`)

### Aggiornare i mock quando si ottimizzano query DB con JOIN

Quando si refactora una funzione che esegue N query separate in un JOIN singolo,
**tutti** i file di test che chiamano quella funzione (anche indirettamente) devono
aggiornare i propri mock. Il pattern da cercare:

- Test che mockano `@/db` con chain `select().from().where().limit()` senza `innerJoin`
- Funzioni nel codice sotto test che chiamano `checkBusinessOwnership` o simili
  **senza mockare `@/lib/server-auth`** → usano la funzione reale, che ora usa JOIN

Fix: aggiungere `innerJoin` al mock chain E ridurre le `mockLimit.mockResolvedValueOnce`
da 2 (profile + business separati) a 1 (risultato JOIN). In alternativa: mockare sempre
`@/lib/server-auth` nei test delle server actions che usano ownership check.

Cerca file affetti con: `grep -rn "FAKE_PROFILE\|Ownership check" tests/ src/ --include="*.test.ts"`

### Testare NODE_ENV in unit test con `vi.stubEnv`

`process.env.NODE_ENV` **non è direttamente scrivibile** in Vitest (TypeError se si usa
`Object.defineProperty`). Usare sempre `vi.stubEnv` + `vi.unstubAllEnvs()` in `afterEach`:

```typescript
import { afterEach, it, vi } from "vitest";

afterEach(() => vi.unstubAllEnvs());

it("si comporta diversamente in produzione", () => {
  vi.stubEnv("NODE_ENV", "production");
  // ... assertions ...
});
```

### URL parsing vs startsWith per controlli hostname

Usare **sempre** `new URL(link)` + `url.hostname === expected` per verificare che un link
punti al proprio dominio. `link.startsWith("https://mio.dominio.it")` è bypassabile con
`https://mio.dominio.it.attacker.tld/`. Il check corretto:

```typescript
let parsed: URL | null = null;
try {
  parsed = new URL(link);
} catch {
  /* malformed */
}
if (
  !parsed ||
  parsed.protocol !== "https:" ||
  parsed.hostname !== expectedHostname
) {
  // blocca
}
```

### Race condition su operazioni multi-riga: preferire constraint DB all'application lock

Per prevenire operazioni duplicate concorrenti (es. doppio VOID dello stesso SALE), la
soluzione più robusta è un **constraint DB** (UNIQUE, partial index) piuttosto che un
lock applicativo. Il DB garantisce atomicità; il codice applicativo può solo essere
TOCTOU-vulnerabile. Pattern:

1. Aggiungere `UNIQUE INDEX ... WHERE col IS NOT NULL` in una migrazione
2. Inserire con `onConflictDoNothing()`
3. Se `returning` è vuoto, discriminare il caso "stessa key" (idempotency) da "key diversa, stessa riga target" (race condition) via query separata

### Scope idempotency key: sempre per-tenant, mai globale

I vincoli UNIQUE su `idempotency_key` vanno sempre scoped al tenant (`business_id`):
`UNIQUE(business_id, idempotency_key)`. Un constraint globale blocca business diversi
che usano accidentalmente la stessa UUID e può esporre metadati cross-tenant. I fallback
di lookup devono filtrare per `businessId` in aggiunta alla key.

### Checklist pre-PR

Prima di aprire una PR verificare che la pipeline CI passi localmente:

```bash
npm run lint          # nessun errore ESLint / TypeScript
npx prettier --check src/  # nessun errore di formattazione
npm run test:coverage # tutti i test verdi, coverage non in calo
```

**⚠️ `prettier-plugin-tailwindcss` ordina automaticamente le classi Tailwind.**
Dopo aver aggiunto o modificato classi Tailwind in file `.tsx`/`.ts`, eseguire sempre:

```bash
npx prettier --write <file modificati>
```

altrimenti il check `prettier --check` in CI fallisce. Il plugin è configurato in
`.prettierrc` e riordina le classi secondo la sequenza canonica di Tailwind CSS.

Controlli manuali:

- [ ] Ogni `it()`/`test()` ha almeno un `expect()`
- [ ] I mock di classi usano `function`/`class` (non arrow function)
- [ ] I nomi delle variabili nel factory `vi.mock` iniziano con `mock`
- [ ] Nessuna nuova issue SonarCloud Blocker/Critical introdotta

### `react/cache` non deduplicaza tra Route Handler e RSC page

`cache()` da `react` è scoped al singolo render tree RSC. **Non** deduplicata
tra la page RSC `/r/[id]` e la Route Handler `/r/[id]/pdf` — sono HTTP request
separate. Usare `cache()` in una funzione di data-access condivisa crea una
falsa aspettativa. Preferire plain async function + chiamata diretta al DB in
ogni entry point.

### Pattern `INSERT ... ON CONFLICT DO NOTHING` per race condition sul creazione riga

Quando un endpoint può essere invocato concorrentemente per lo stesso utente
(es. doppio click su "Checkout"), il pattern "SELECT then INSERT" causa un
unique-constraint violation → 500 sulla richiesta persa. Fix pattern Drizzle:

```typescript
const [inserted] = await db
  .insert(table)
  .values({...})
  .onConflictDoNothing()
  .returning({ col: table.col });

if (!inserted) {
  // Conflict: re-SELECT per recuperare il valore del "winner"
  const [existing] = await db.select(...).where(...);
}
```

### Mock Drizzle con `transaction`: il callback riceve `tx`, non `db`

Quando il codice usa `db.transaction(async (tx) => { tx.update(...) })`, i
test devono aggiungere `transaction` al mock di `getDb()` come passthrough:

```typescript
const mockTransaction = vi.fn();
// In beforeEach (dopo vi.clearAllMocks()):
mockTransaction.mockImplementation(async (fn) =>
  fn({ select: mockSelect, insert: mockInsert, update: mockUpdate }),
);
```

Se si dimentica, il codice chiama `db.transaction(undefined)` → TypeError silenzioso.

### Sentry: pino logMethod hook fires BEFORE redaction — sanitize before captureException

`pino`'s `redact` config runs during **serialisation** (when the log is written to output), but the `logMethod` hook fires before serialisation with the **raw** object. Any field forwarded to `Sentry.captureException/captureMessage` from inside `logMethod` is therefore un-redacted.

Fix: always pass context through `sanitizeForTelemetry()` before any Sentry call. Use an explicit **allowlist** of safe keys (requestId, userId, path, documentId, adeErrorCodes, …) rather than a denylist — easier to reason about and impossible to accidentally miss new sensitive fields.

Pattern in `src/lib/logger.ts`:

```typescript
function captureToSentry(obj: unknown, msg?: string): void {
  const sanitized = sanitizeForTelemetry(obj); // allowlist, strips PII
  if (... instanceof Error) {
    Sentry.captureException(err, { extra: sanitized });
  }
}
```

Error objects in `extra` must be extracted as `{ name, message }` only — the stack trace and cause chain can embed request context (query params, headers) from the call site.

### deleteAccount: delete auth user FIRST to prevent orphan auth entries

The safe ordering for account deletion is **auth-first**:

1. Delete Supabase Auth user (admin API, 3 retries × backoff)
2. If auth deletion fails → return `{ error }` immediately; profile is untouched and user can still log in and retry
3. If auth deletion succeeds → delete profile (FK cascade)
4. If profile deletion fails → log `critical: true`, manual cleanup needed (but auth entry is gone, so no login is possible)

Previous ordering (profile-first) left an orphan auth entry that blocked re-registration when auth deletion exhausted all retries. Inverting the order contains the failure: either nothing is deleted (safe), or only the profile orphan remains (less harmful).

### Aggiornamento `last_used_at` con WHERE condizionale anti-write-amplification

Per evitare un DB write su ogni API request, usare:

```typescript
.where(and(eq(table.id, id), or(isNull(table.lastUsedAt), lt(table.lastUsedAt, threshold))))
```

Il DB aggiorna solo se `lastUsedAt IS NULL OR lastUsedAt < NOW - N_min`.
Sempre fire-and-forget (`.catch(logger.warn)`). Throttle consigliato: 10 minuti.

## Sito vetrina (landing/marketing)

Stesso progetto Next.js, non un sito separato:

- La pagina marketing principale (`/`) è una route SSG nel Next.js App Router —
  generata staticamente al build, veloce. Le sezioni funzionalità e prezzi sono
  anchor link sulla homepage (`#funzionalita`, `#prezzi`), non route separate.
- L'app SaaS vive sotto /dashboard — route dinamiche protette da auth
- Meta tag e Open Graph automatici via Next.js `metadata` API
- Sitemap via `next-sitemap`; structured data JSON-LD per rich snippets
- **Dati di contatto centralizzati** — P.IVA, email e altri riferimenti aziendali
  sono in un file costanti condiviso (non duplicati nelle singole pagine marketing).
  Aggiornare lì e si propagano ovunque automaticamente.

## Conformità legale

- **Privacy Policy** — obbligatoria (GDPR). Versione attuale: `/privacy/v01`
- **Cookie Policy** — solo cookie tecnici (Supabase auth) + analytics cookieless (Umami) → no banner
- **Termini di Servizio** — versione attuale: `/termini/v01`
- **GDPR art. 20 — Portabilità dati** — `exportUserData()` in `src/server/export-actions.ts`; UI in `/dashboard/settings`
- **Accettazione T&C tracciata** — `signUp` salva `terms_accepted_at` + `terms_version` su `profiles`.
  La versione corrente è `CURRENT_TERMS_VERSION` in `src/server/auth-actions.ts`.

**Procedura aggiornamento T&C:**

1. Creare `src/app/(marketing)/termini/vXX/page.tsx` con il nuovo testo
2. Aggiornare il redirect in `src/app/(marketing)/termini/page.tsx` → `/termini/vXX`
3. Aggiornare `CURRENT_TERMS_VERSION = "vXX"` in `src/server/auth-actions.ts`
4. Aggiornare il testo del **secondo flag** (clausole vessatorie art. 1341 c.c.) in
   `src/app/(auth)/register/page.tsx` — i numeri di paragrafo devono rispecchiare
   la struttura della nuova versione

**Procedura aggiornamento Privacy Policy:**

1. Creare `src/app/(marketing)/privacy/vXX/page.tsx`
2. Aggiornare redirect in `src/app/(marketing)/privacy/page.tsx` → `/privacy/vXX`
3. Aggiungere `/privacy/vXX` in `src/app/sitemap.ts` e aggiornare `sitemap.test.ts`
4. Aggiungere `privacy/vXX/page.tsx` a `sonar.coverage.exclusions`
5. Notificare gli utenti almeno 15 giorni prima dell'entrata in vigore

## Decisioni architetturali

| Scelta                       | Motivo chiave                                                                      |
| ---------------------------- | ---------------------------------------------------------------------------------- |
| **Next.js** vs SPA           | SSR per SEO + Server Actions eliminano backend separato                            |
| **Supabase** vs Firebase     | PostgreSQL standard, RLS nativo, no vendor lock-in                                 |
| **PWA** vs app nativa        | Un codebase, no App Store, aggiornamenti istantanei                                |
| **shadcn/ui**                | Componenti accessibili, copia nel progetto (non dipendenza), Radix UI              |
| **Integrazione diretta AdE** | Zero costo per scontrino, no dipendenza da terze parti                             |
| **Cloudflare Tunnel**        | Già attivo sulla VPS, HTTPS/CDN/DDoS gratis, IP nascosto                           |
| **Stripe**                   | Fee EU più basse (1.5% + €0.25), API eccellente; MoR rimandato a espansione estera |
| **Resend**                   | Free tier 3k/mese, React Email type-safe, deliverability ottima                    |
| **SonarQube Cloud**          | SAST gratuito ≤50k LOC, PR decoration, Quality Gate                                |
| **TDD**                      | Fondamentale per l'integrazione AdE (fragile) e refactoring sicuro                 |
| **Due ambienti**             | AdE irreversibile: un scontrino emesso non si cancella                             |
| **Umami self-hosted**        | Analytics GDPR-compliant senza cookie, gratis sulla stessa VPS                     |

## Struttura progetto

```
scontrinozero/
├── src/
│   ├── app/                # Next.js App Router
│   │   ├── (marketing)/    # Route group: landing, prezzi, blog (SSG)
│   │   ├── (auth)/         # Route group: login, register, reset-password
│   │   └── dashboard/      # App SaaS protetta da auth
│   ├── components/         # Componenti React (shadcn/ui + custom)
│   │   └── ui/             # shadcn/ui components
│   ├── lib/                # Utility, client Supabase, helpers
│   │   └── ade/            # Modulo integrazione Agenzia delle Entrate
│   ├── server/             # Server actions, business logic
│   ├── emails/             # Template email (React Email)
│   └── types/              # TypeScript types/interfaces
├── public/                 # Static assets, PWA manifest, icons
├── supabase/               # Migrazioni DB, seed, config
├── tests/                  # Vitest unit tests
├── .github/workflows/      # GitHub Actions CI/CD
├── CLAUDE.md
└── PLAN.md
```

## File HAR da analizzare

Presenti nella root del repo, da analizzare prima delle relative release:

| File                             | Feature                                            | Versione                                          |
| -------------------------------- | -------------------------------------------------- | ------------------------------------------------- |
| `dati_doc_commerciale.har`       | Aggiornamento dati business su AdE post-onboarding | post-v1.0.0 (rinviato, possibile feature premium) |
| `aggiungi_prodotto_catalogo.har` | Aggiunta prodotto su rubrica AdE                   | v1.5.0                                            |
| `modifica_prodotto_catalogo.har` | Modifica prodotto su rubrica AdE                   | v1.5.0                                            |
| `elimina_prodotto_catalogo.har`  | Eliminazione prodotto su rubrica AdE               | v1.5.0                                            |
| `ricerca_prodotto_catalogo.har`  | Ricerca prodotto su rubrica AdE                    | v1.5.0                                            |
| `ricerca_documento.har`          | Ricerca documento su AdE                           | v2.0.0+                                           |
| `login_spid.har`                 | SPID login flow (analizzato e implementato)        | ✅ v0.x                                           |
| `login_cie.har`                  | CIE login flow                                     | v1.8.0+                                           |
