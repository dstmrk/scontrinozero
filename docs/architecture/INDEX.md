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
> ed esegui `npm run arch:check` (CLAUDE.md regola 26). Le citazioni qui sotto
> sono validate da `scripts/check-architecture-docs.mjs`: ogni path in
> `code span` deve esistere su disco, ogni citazione skill `<nome>` deve
> risolvere a una directory sotto `.claude/skills`, e ogni skill esistente deve
> comparire in almeno un indice (qui o in `CLAUDE.md`).

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
    llms-full.txt/  route handler /llms-full.txt (testo completo dei registry per crawler AI)
    feed.xml/       route handler /feed.xml (RSS 2.0 delle guide)
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
Bearer key), `src/app/api/stripe` (webhook), `src/app/api/health` (le tre
probe di smoke: `live`, `env`, `sentry-sentinel`), `src/app/api/documents`,
`src/app/api/export`, `src/app/api/csp-report`.

Sottocartelle di `src/lib/`: `src/lib/ade` (integrazione AdE HTTP),
`src/lib/services` (orchestrazione emit/void/recovery), `src/lib/receipts`
(totali, PDF, CSV, lotteria), `src/lib/supabase` (client server/admin +
middleware), `src/lib/pdf`, `src/lib/printing` (stampa termica ESC/POS via
Web Bluetooth), `src/lib/pwa`, `src/lib/partners` (hostname →
partner per il branding subdomain), e i data file marketing
`src/lib/guide` `src/lib/help` `src/lib/per` `src/lib/confronto`
`src/lib/strumenti`.

## Dove vivo X? (i punti che oggi costringono a grep)

| Cerchi…                                           | Vai a                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth della richiesta (user UUID, bind Sentry)     | `src/lib/server-auth.ts` (`getAuthenticatedUser`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Client Supabase (server/admin/middleware)         | `src/lib/supabase/server.ts`, `src/lib/supabase/admin.ts`, `src/lib/supabase/middleware.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Azioni auth (login/register/reset, T&C version)   | `src/server/auth-actions.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Errore non gestito di una pagina (boundary)       | segmento dashboard `src/app/dashboard/error.tsx` (tiene shell e CSS, cattura in Sentry i soli errori client) · fallback globale `src/app/global-error.tsx` (rimpiazza il documento intero; resta per gli errori del layout) · degrado inline del piano `src/components/dashboard/plan-unavailable.tsx`                                                                                                                                                                                                                                                                                                                       |
| Plan gate / feature flag per piano                | `src/lib/plans.ts` + `src/lib/plans-shared.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Referral program (codice, redemption, reward)     | `src/lib/referral-code.ts`, `src/db/schema/referral-redemptions.ts`, cattura in `src/server/auth-actions.ts` (`signUp`), reward in `src/server/onboarding-actions.ts` (`finalizeAdeVerification`)                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Partner/reseller (subdomain branding, force+lock) | `src/lib/partners/partner-host.ts`, `src/lib/partners/partner-context.ts`, `src/db/schema/partners.ts`, branding `src/components/partner-brand-suffix.tsx`, enforcement in `src/server/auth-actions.ts` · ops in `PARTNER.md`                                                                                                                                                                                                                                                                                                                                                                                                |
| Totali scontrino (cents per-riga, canonico)       | `src/lib/receipts/receipt-totals.ts` (`calcInputLinesTotalCents`, `calcDocTotal`, `computeReceiptTotals`) — puro/client-safe; `src/lib/receipts/document-lines.ts` aggiunge le query e li re-esporta                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Resa del documento commerciale (layout AdE)       | Tre superfici, stesso layout, **due forme** (vendita e annullo, unione discriminata su `kind`): PDF `src/lib/pdf/commercial-document.ts` · termica `src/lib/printing/receipt-escpos.ts` · pagina pubblica `src/app/r`. Diciture e indirizzo condivisi in `src/lib/receipt-format.ts` (`PAYMENT_LABELS`, `formatBusinessAddressLines`, `formatReceiptDate`), codifica IVA/legenda in `src/lib/receipts/vat-display.ts` (`receiptVatLabel` → `ES*`, `receiptVatLegend` → `*ES = Esente`). Chi è stampabile lo decide `src/lib/receipts/printable-document.ts`; la data stampata è sempre `ade_registered_at`, mai `created_at` |
| Data fiscale del documento                        | `ade_registered_at` (migrazione 0031): non solo la data **mostrata** su ogni superficie, ma anche il **predicato di periodo** e l'ordinamento di elenco storico (`src/server/storico-actions.ts`) ed export CSV (`src/lib/receipts/csv-export.ts`, che serve entrambi i tagli: riepilogo per scontrino e dettaglio per voce venduta, scelti da `?format=summary                                                                                                                                                                                                                                                              | detail`su`src/app/api/export/receipts/route.ts`) — indice `(business_id, ade_registered_at)`, migrazione 0032. `created_at` resta il nostro orologio d'inserimento, usato dal recovery stale-pending. Gli estremi dell'intervallo sono le mezzanotti **italiane** (`parseRomeDayStartUtc`/`parseRomeDayEndExclusiveUtc`in`src/lib/date-utils.ts`), non UTC |
| Stampa scontrino su termica Bluetooth             | rendering `src/lib/printing/receipt-escpos.ts` · trasporto `src/lib/printing/bluetooth-printer.ts` · hook `src/hooks/use-printer.ts` · bottone `src/components/printing/print-receipt-button.tsx` · card impostazioni `src/components/settings/printer-section.tsx`                                                                                                                                                                                                                                                                                                                                                          |
| Orchestrazione emissione / annullo                | `src/lib/services/receipt-service.ts`, `src/lib/services/void-service.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Recovery stale-pending AdE                        | `src/lib/services/ade-recovery.ts`, `src/lib/services/request-hash.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Integrazione AdE (client reale/mock, adapter)     | `src/lib/ade/index.ts`, `src/lib/ade/real-client.ts`, `src/lib/ade/mock-client.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Sessione AdE riusata (Fisconline vs CIE)          | Fisconline (rinnovo silenzioso): `src/lib/ade/session-cache.ts` · CIE (interattiva, conferma push utente): `src/lib/ade/interactive-session-store.ts` + pre-check `isCieSessionMissing` in `src/lib/ade/index.ts`                                                                                                                                                                                                                                                                                                                                                                                                            |
| Classi errore AdE + logging tipato                | `src/lib/ade/errors.ts`, `src/lib/ade/log-failure.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Logger pino → Sentry (hook level≥50)              | `src/lib/logger.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Filtri Sentry client (network noise)              | `src/lib/sentry-filters.ts`, `instrumentation-client.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Env d'identità (URL/hostname, fail-fast)          | `src/lib/identity-env.ts`, `src/lib/hostname-env.ts`, `src/lib/trusted-app-url.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Link marketing → app (cross-origin)               | `src/lib/marketing-to-app-href.ts` (`appHref`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Rate limit                                        | `src/lib/rate-limit.ts`; client IP → `src/lib/get-client-ip.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Validazione boundary (UUID/email/body)            | `src/lib/validation.ts`, `src/lib/uuid.ts`, `src/lib/request-utils.ts`, `src/lib/api-errors.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Crittografia credenziali AdE (AES-256-GCM)        | `src/lib/crypto.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| CSP / security headers                            | `src/lib/csp.ts`, `src/lib/security-headers.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Developer API (auth Bearer + handler)             | `src/app/api/v1/receipts`, `src/lib/api-auth.ts`, `src/lib/api-keys.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Envelope d'errore v1 (`{code,message,requestId}`) | catalogo codice → status/retryability/`Retry-After` in `src/lib/api-v1-errors.ts` (`V1_ERROR_CATALOG`, `v1Error`/`v1Json`); mapping service-code → codice pubblico in `src/lib/api-v1-helpers.ts` (`serviceErrorResponse`)                                                                                                                                                                                                                                                                                                                                                                                                   |
| Stripe (SDK wrapper + webhook)                    | `src/lib/stripe.ts`, `src/app/api/stripe`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Schema DB (una tabella per file)                  | `src/db/schema` (es. `src/db/schema/profiles.ts`, `src/db/schema/commercial-documents.ts`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Contenuti marketing/SEO (data file)               | `src/lib/guide`, `src/lib/help`, `src/lib/per`, `src/lib/confronto`, `src/lib/strumenti`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Viewport / theme-color / safe-area della PWA      | `src/lib/pwa/viewport.ts` — `rootViewport` (chiaro fisso) esportato da `src/app/layout.tsx`, `dashboardViewport` (`viewportFit: "cover"` + coppia light/dark) da `src/app/dashboard/layout.tsx`. Senza quell'export ogni `env(safe-area-inset-*)` vale `0px`. Il pull-to-refresh è neutralizzato in `src/app/globals.css` sotto `@media (display-mode: standalone)`                                                                                                                                                                                                                                                          |
| Health/diagnostica post-deploy                    | `src/app/api/health` (`live`, `env`, `sentry-sentinel`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Cancellazione account (self-service + purge)      | `src/server/account-actions.ts` (`deleteAccount`), helper condiviso `src/lib/services/purge-user.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| GDPR pruning utenti inattivi >12 mesi             | `src/lib/services/inactive-user-prune.ts` + config `src/lib/services/inactive-user-prune-config.ts`, sweep in `src/instrumentation.ts`; segnale "visita autenticata" `last_seen_at` toccato da `touchLastSeen` in `src/lib/server-auth.ts`                                                                                                                                                                                                                                                                                                                                                                                   |

## Indice Server Actions (`src/server/*-actions.ts`)

Tutte sono `"use server"`; sulle azioni di lettura vale "degradare, non lanciare"
(CLAUDE.md regola 19).

| File                               | Responsabilità                                                                                                   |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `src/server/auth-actions.ts`       | login, registrazione, reset password, accettazione T&C                                                           |
| `src/server/onboarding-actions.ts` | wizard collegamento credenziali AdE — method-aware Fisconline/CIE (`saveAdeCredentials`/`verifyAdeCredentials`)  |
| `src/server/receipt-actions.ts`    | emissione scontrino (cassa)                                                                                      |
| `src/server/void-actions.ts`       | annullo documento                                                                                                |
| `src/server/storico-actions.ts`    | elenco/ricerca documenti emessi + rilettura di una singola riga                                                  |
| `src/server/analytics-actions.ts`  | KPI e analytics (helper in `src/server/analytics-helpers.ts`)                                                    |
| `src/server/catalog-actions.ts`    | catalogo prodotti rapidi                                                                                         |
| `src/server/export-actions.ts`     | export dei dati personali (GDPR art. 20) — l'export CSV Pro-gated vive in `src/app/api/export/receipts/route.ts` |
| `src/server/billing-actions.ts`    | checkout / customer portal Stripe                                                                                |
| `src/server/profile-actions.ts`    | impostazioni profilo/attività                                                                                    |
| `src/server/account-actions.ts`    | gestione account (es. cancellazione)                                                                             |
| `src/server/api-key-actions.ts`    | gestione API key Developer                                                                                       |

## Moduli cross-cutting (toccati da quasi ogni feature)

- `src/lib/server-auth.ts` — gate auth + `Sentry.setUser` per richiesta (regola 22)
- `src/lib/auth-errors.ts` — `UnauthenticatedError` + `authErrorResult` (sessione assente vs errore inatteso, regola 19/20)
- `src/lib/logger.ts` — unico logger; `error` (≥50) → `Sentry.captureException`
- `src/lib/plans.ts` / `src/lib/plans-shared.ts` — gate piani, fonte di verità;
  le server action **e le pagine RSC del dashboard** leggono il piano con
  `getPlanSafe` (envelope `{ ok, error }` su profilo orfano / DB sovraccarico,
  regola 19), mai con `getPlan` nudo — la classificazione condivisa è
  `classifyPlanReadError`. Nelle pagine l'envelope non è opzionale: `redirect()`
  di Next funziona **lanciando** `NEXT_REDIRECT`, quindi un `try/catch` intorno
  al plan gate se lo mangerebbe
- `src/lib/receipts/receipt-totals.ts` — aritmetica monetaria canonica (regola 17), **puro e client-safe**: `document-lines.ts` importa `getDb()`, quindi i client component devono importare da qui o si portano dietro il driver postgres nel bundle browser
- `src/lib/ade/log-failure.ts` — classificazione errori AdE (regole 20/23)
- `src/lib/ade/interactive-session-store.ts` — sessioni CIE interattive
  (TTL/LRU per-business; a differenza di `src/lib/ade/session-cache.ts`
  Fisconline non si rinnova in silenzio: serve la conferma push dell'utente)
- `src/lib/identity-env.ts` — validazione env d'identità al boot (regola 24)
- `src/lib/umami.ts` + `src/components/umami-script.tsx` — web-analytics Umami (script cookieless nel root layout + helper `track()`); ≠ dal dominio "analytics" business (KPI dashboard in `src/server/analytics-actions.ts`)
- `src/db/schema/index.ts` — barrel dello schema Drizzle

## Scelte architetturali rapide

Tutte motivate dalle priorità di `CLAUDE.md` (performance percepita, hobby
project, leggero sulle risorse):

- **Next.js** monolite (SSR + Server Actions, no backend separato)
- **Supabase** vs Firebase (Postgres standard, RLS nativo, no lock-in)
- **PWA** vs nativa (un codebase, no store, update istantanei)
- **shadcn/ui** (copy-paste in repo, Radix sotto)
- **Integrazione diretta AdE** (zero costo per scontrino, no terzi)
- **Cloudflare Tunnel** (HTTPS/CDN/DDoS gratis, IP nascosto)
- **Stripe** (fee EU 1.5% + €0.25, API ottima; MoR rimandato)
- **Resend** (free 3k/mese, React Email type-safe)
- **TDD** (integrazione AdE fragile, refactoring sicuro)
- **Tre ambienti** prod/sandbox/dev (AdE irreversibile: uno scontrino emesso non
  si cancella — solo prod ha `ADE_MODE=real`)
- **Umami self-hosted** (GDPR, no cookie, gratis sulla stessa VPS)

## Altri riferimenti

- **Prescrittivo per dominio** → `.claude/skills/` (ade-integration,
  db-migrations, deploy-release, marketing-content, money-rounding,
  playwright-verify, pwa-serwist, react-patterns, security-patterns,
  sentry-hygiene, sonar-quality-gate, stripe-webhooks, testing-patterns)
- **Comportamento sempre-attivo** → `CLAUDE.md`
- **Roadmap** → `PLAN.md` · **Bug/tech debt** → `REVIEW.md` · **Developer API** →
  `DEVELOPER.md` · **Surface REST + flussi HTTP AdE** → `docs/api-spec.md`
