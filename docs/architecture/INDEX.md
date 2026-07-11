# Mappa codebase — INDEX

> **Leggi questo file PRIMA di esplorare la codebase.** È una mappa
> _navigazionale_: dice **dove vivono le cose**, così non serve un grep/glob a
> tappeto a ogni task. Per i flussi end-to-end → `docs/architecture/data-flows.md`;
> per soglie/limiti/gate → `docs/architecture/config-manifest.md`. Le **skill**
> in `.claude/skills/` restano la fonte _prescrittiva_ ("come fare X nel dominio
> Y"); questa mappa è _descrittiva_ ("dove sta X").
>
> ⚠️ **Tieni vivo questo file.** Quando sposti/rinomini/aggiungi un modulo
> cross-cutting, cambi un flusso o una soglia, aggiorna la mappa nello stesso PR
> ed esegui `npm run arch:check` (CLAUDE.md regola 26). Le citazioni di path qui
> sotto sono validate da `scripts/check-architecture-docs.mjs`: ogni path in
> `code span` deve esistere su disco.

## Stack in una riga

Next.js 16 (App Router) · React 19 · TS strict · Tailwind 4 · shadcn/ui ·
Drizzle ORM su Supabase Postgres · Supabase Auth · Stripe · Resend · Sentry +
pino · PWA Serwist. Monolite SSR + Server Actions, nessun backend separato.
Dettaglio stack/ambienti in `CLAUDE.md`.

## Albero `src/` (scopo per directory)

```
src/
  app/            App Router. Route group + route handler API.
    (auth)/         login, register, reset-password (cross-origin → app.*)
    (marketing)/    sito pubblico SSG/SEO (/help, /guide, /per, /confronto, /strumenti, /termini)
    dashboard/      area autenticata: cassa, storico, analytics, settings
    onboarding/     wizard collegamento credenziali AdE
    api/            route handler (vedi sotto)
    r/              pagina pubblica scontrino (QR / link)
    sitemap.ts robots.ts manifest.ts layout.tsx global-error.tsx
    llms.txt/       route handler /llms.txt (indice markdown per crawler AI)
  components/     React. Sottocartelle per dominio (cassa, storico, analytics,
                  catalogo, billing, settings, ade, receipts, marketing, help,
                  pwa, dashboard, announcement) + ui/ (shadcn) + providers.tsx
  db/             Drizzle: connessione (index.ts) + schema/ (una tabella per file)
  emails/         template React Email (Resend)
  hooks/          React hooks condivisi
  lib/            utility e logica condivisa client+server (vedi sotto)
  server/         Server Actions ("use server"): *-actions.ts
  types/          definizioni TypeScript condivise
  instrumentation.ts proxy.ts sw.ts
```

Route handler sotto `src/app/api/`: `src/app/api/v1` (Developer API pubblica,
Bearer key), `src/app/api/stripe` (webhook), `src/app/api/health` (liveness),
`src/app/api/_health` (env probe), `src/app/api/_debug` (sentry-sentinel),
`src/app/api/documents`, `src/app/api/export`, `src/app/api/csp-report`.

Sottocartelle di `src/lib/`: `src/lib/ade` (integrazione AdE HTTP),
`src/lib/services` (orchestrazione emit/void/recovery), `src/lib/receipts`
(totali, PDF, CSV, lotteria), `src/lib/supabase` (client server/admin +
middleware), `src/lib/pdf`, `src/lib/pwa`, `src/lib/partners` (hostname →
partner per il branding subdomain), e i data file marketing
`src/lib/guide` `src/lib/help` `src/lib/per` `src/lib/confronto`
`src/lib/strumenti`.

## Dove vivo X? (i punti che oggi costringono a grep)

| Cerchi…                                           | Vai a                                                                                                                                                                                                                                      |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Auth della richiesta (user UUID, bind Sentry)     | `src/lib/server-auth.ts` (`getAuthenticatedUser`)                                                                                                                                                                                          |
| Client Supabase (server/admin/middleware)         | `src/lib/supabase/server.ts`, `src/lib/supabase/admin.ts`, `src/lib/supabase/middleware.ts`                                                                                                                                                |
| Azioni auth (login/register/reset, T&C version)   | `src/server/auth-actions.ts`                                                                                                                                                                                                               |
| Plan gate / feature flag per piano                | `src/lib/plans.ts` + `src/lib/plans-shared.ts`                                                                                                                                                                                             |
| Referral program (codice, redemption, reward)     | `src/lib/referral-code.ts`, `src/db/schema/referral-redemptions.ts`, cattura in `src/server/auth-actions.ts` (`signUp`), reward in `src/server/onboarding-actions.ts` (`finalizeAdeVerification`)                                          |
| Partner/reseller (subdomain branding, force+lock) | `src/lib/partners/partner-host.ts`, `src/lib/partners/partner-context.ts`, `src/db/schema/partners.ts`, branding `src/components/partner-brand-suffix.tsx`, enforcement in `src/server/auth-actions.ts` · ops in `PARTNER.md`              |
| Totali scontrino (cents per-riga, canonico)       | `src/lib/receipts/document-lines.ts` (`calcInputLinesTotalCents`, `calcDocTotal`)                                                                                                                                                          |
| Orchestrazione emissione / annullo                | `src/lib/services/receipt-service.ts`, `src/lib/services/void-service.ts`                                                                                                                                                                  |
| Recovery stale-pending AdE                        | `src/lib/services/ade-recovery.ts`, `src/lib/services/request-hash.ts`                                                                                                                                                                     |
| Integrazione AdE (client reale/mock, adapter)     | `src/lib/ade/index.ts`, `src/lib/ade/real-client.ts`, `src/lib/ade/mock-client.ts`                                                                                                                                                         |
| Classi errore AdE + logging tipato                | `src/lib/ade/errors.ts`, `src/lib/ade/log-failure.ts`                                                                                                                                                                                      |
| Logger pino → Sentry (hook level≥50)              | `src/lib/logger.ts`                                                                                                                                                                                                                        |
| Filtri Sentry client (network noise)              | `src/lib/sentry-filters.ts`, `sentry.client.config.ts`                                                                                                                                                                                     |
| Env d'identità (URL/hostname, fail-fast)          | `src/lib/identity-env.ts`, `src/lib/hostname-env.ts`, `src/lib/trusted-app-url.ts`                                                                                                                                                         |
| Link marketing → app (cross-origin)               | `src/lib/marketing-to-app-href.ts` (`appHref`)                                                                                                                                                                                             |
| Rate limit                                        | `src/lib/rate-limit.ts`; client IP → `src/lib/get-client-ip.ts`                                                                                                                                                                            |
| Validazione boundary (UUID/email/body)            | `src/lib/validation.ts`, `src/lib/uuid.ts`, `src/lib/request-utils.ts`, `src/lib/api-errors.ts`                                                                                                                                            |
| Crittografia credenziali AdE (AES-256-GCM)        | `src/lib/crypto.ts`                                                                                                                                                                                                                        |
| CSP / security headers                            | `src/lib/csp.ts`, `src/lib/security-headers.ts`                                                                                                                                                                                            |
| Developer API (auth Bearer + handler)             | `src/app/api/v1/receipts`, `src/lib/api-auth.ts`, `src/lib/api-keys.ts`                                                                                                                                                                    |
| Stripe (SDK wrapper + webhook)                    | `src/lib/stripe.ts`, `src/app/api/stripe`                                                                                                                                                                                                  |
| Schema DB (una tabella per file)                  | `src/db/schema` (es. `src/db/schema/profiles.ts`, `src/db/schema/commercial-documents.ts`)                                                                                                                                                 |
| Contenuti marketing/SEO (data file)               | `src/lib/guide`, `src/lib/help`, `src/lib/per`, `src/lib/confronto`, `src/lib/strumenti`                                                                                                                                                   |
| Health/diagnostica post-deploy                    | `src/app/api/health`, `src/app/api/_health`, `src/app/api/_debug`                                                                                                                                                                          |
| Cancellazione account (self-service + purge)      | `src/server/account-actions.ts` (`deleteAccount`), helper condiviso `src/lib/services/purge-user.ts`                                                                                                                                       |
| GDPR pruning utenti inattivi >12 mesi             | `src/lib/services/inactive-user-prune.ts` + config `src/lib/services/inactive-user-prune-config.ts`, sweep in `src/instrumentation.ts`; segnale "visita autenticata" `last_seen_at` toccato da `touchLastSeen` in `src/lib/server-auth.ts` |

## Indice Server Actions (`src/server/*-actions.ts`)

Tutte sono `"use server"`; sulle azioni di lettura vale "degradare, non lanciare"
(CLAUDE.md regola 19).

| File                               | Responsabilità                                                |
| ---------------------------------- | ------------------------------------------------------------- |
| `src/server/auth-actions.ts`       | login, registrazione, reset password, accettazione T&C        |
| `src/server/onboarding-actions.ts` | wizard collegamento credenziali AdE                           |
| `src/server/receipt-actions.ts`    | emissione scontrino (cassa)                                   |
| `src/server/void-actions.ts`       | annullo documento                                             |
| `src/server/storico-actions.ts`    | elenco/ricerca documenti emessi                               |
| `src/server/analytics-actions.ts`  | KPI e analytics (helper in `src/server/analytics-helpers.ts`) |
| `src/server/catalog-actions.ts`    | catalogo prodotti rapidi                                      |
| `src/server/export-actions.ts`     | export CSV (Pro-gated)                                        |
| `src/server/billing-actions.ts`    | checkout / customer portal Stripe                             |
| `src/server/profile-actions.ts`    | impostazioni profilo/attività                                 |
| `src/server/account-actions.ts`    | gestione account (es. cancellazione)                          |
| `src/server/api-key-actions.ts`    | gestione API key Developer                                    |

## Moduli cross-cutting (toccati da quasi ogni feature)

- `src/lib/server-auth.ts` — gate auth + `Sentry.setUser` per richiesta (regola 22)
- `src/lib/auth-errors.ts` — `UnauthenticatedError` + `authErrorResult` (sessione assente vs errore inatteso, regola 19/20)
- `src/lib/logger.ts` — unico logger; `error` (≥50) → `Sentry.captureException`
- `src/lib/plans.ts` / `src/lib/plans-shared.ts` — gate piani, fonte di verità
- `src/lib/receipts/document-lines.ts` — aritmetica monetaria canonica (regola 17)
- `src/lib/ade/log-failure.ts` — classificazione errori AdE (regole 20/23)
- `src/lib/identity-env.ts` — validazione env d'identità al boot (regola 24)
- `src/lib/umami.ts` + `src/components/umami-script.tsx` — web-analytics Umami (script cookieless nel root layout + helper `track()`); ≠ dal dominio "analytics" business (KPI dashboard in `src/server/analytics-actions.ts`)
- `src/db/schema/index.ts` — barrel dello schema Drizzle

## Altri riferimenti

- **Prescrittivo per dominio** → `.claude/skills/` (ade-integration, db-migrations,
  react-patterns, security-patterns, sentry-hygiene, sonar-quality-gate,
  stripe-webhooks, testing-patterns)
- **Comportamento sempre-attivo** → `CLAUDE.md`
- **Roadmap** → `PLAN.md` · **Bug/tech debt** → `REVIEW.md` · **Developer API** →
  `DEVELOPER.md` · **Surface REST + flussi HTTP AdE** → `docs/api-spec.md`
