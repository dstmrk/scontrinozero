# Mappa codebase — Data flows

> Deep-dive _on-demand_: leggilo quando tocchi uno di questi flussi. Ogni step
> punta al file; le **regole di comportamento** restano in `CLAUDE.md` (non le
> ripeto, le cito per numero). Per "dove sta X" → `docs/architecture/INDEX.md`.

## Auth della richiesta

1. UI/route handler chiama `getAuthenticatedUser` in `src/lib/server-auth.ts`.
2. Risolve la sessione via `src/lib/supabase/server.ts` e **binda l'UUID** allo
   scope Sentry (`Sentry.setUser({ id })`, CLAUDE.md regola 22).
3. Le azioni auth (login/register/reset, versione T&C) vivono in
   `src/server/auth-actions.ts`; il refresh sessione lato edge in
   `src/lib/supabase/middleware.ts`.
4. Errori d'input prevedibili (password sbagliata, P.IVA già usata) → `warn`,
   non Sentry (regola 20).

## Emissione scontrino (cassa)

1. Form cassa (`src/components/cassa`) → server action
   `src/server/receipt-actions.ts`.
2. Validazione + calcolo totali **per-riga in cents** con
   `src/lib/receipts/document-lines.ts` (regola 17): l'importo trasmesso ad AdE
   e quello mostrato al cliente devono coincidere.
3. Orchestrazione in `src/lib/services/receipt-service.ts`: idempotency
   (`src/lib/services/request-hash.ts`), chiamata AdE, transazione DB.
4. Client AdE risolto da `src/lib/ade/index.ts` (reale `src/lib/ade/real-client.ts`
   vs mock `src/lib/ade/mock-client.ts` secondo `ADE_MODE`). La sessione Fisconline
   è riusata fra operazioni ravvicinate dello stesso business via
   `withAdeSession` + `src/lib/ade/session-cache.ts` (cache in-process con TTL/LRU
   e lock per-business), invalidata su cambio credenziali. Evita di ripetere il
   login (~10 round-trip, latenza dominante) a ogni emissione.
5. **Ramo CIE** (login method `cie`): la sessione interattiva vive in
   `src/lib/ade/interactive-session-store.ts` e **non è rinnovabile in
   silenzio** (serve la conferma push dell'utente). Il service fa il pre-check
   `isCieSessionMissing` **prima** di inserire il documento: se manca/scaduta
   ritorna `{ reauthRequired: true }` senza trasmettere nulla — la UI mostra
   "Ricollegati" (`src/components/cassa/cassa-client.tsx`), la Developer API
   risponde 409. Lo stesso esito arriva da `AdeReauthRequiredError` a metà
   flusso (documento marcato ERROR, mai duplicato).
6. UI optimistic: lo scontrino "sembra istantaneo" anche se AdE risponde in 2-5s
   (priorità #1). La server action degrada, non lancia (regola 19).
7. Fallimenti AdE classificati da `src/lib/ade/log-failure.ts` con
   `flow: "emit-receipt"` (regole 20/23).

## Annullo documento (void)

Analogo all'emissione: `src/server/void-actions.ts` →
`src/lib/services/void-service.ts` → client AdE; logging con
`flow: "void-receipt"` via `src/lib/ade/log-failure.ts`. Vale lo stesso ramo
CIE dell'emissione (pre-check `isCieSessionMissing` → `reauthRequired`,
dialog "Ricollegati" in `src/components/storico/void-receipt-dialog.tsx`).

## Onboarding AdE (collegamento credenziali)

1. Wizard `src/app/onboarding` → `src/server/onboarding-actions.ts` —
   **method-aware** (`loginMethod: "fisconline" | "cie"`) in
   `saveAdeCredentials`/`verifyAdeCredentials`.
2. Verifica credenziali contro AdE; le credenziali sono cifrate AES-256-GCM
   con `src/lib/crypto.ts` e salvate in `src/db/schema/ade-credentials.ts`.
   **Ramo CIE**: login federato via SAML IdP (`loginCie` in
   `src/lib/ade/real-client.ts`, credenziali "livello 2" dell'app CIE ID),
   conferma via **notifica push** con finestra di polling (vedi
   `docs/architecture/config-manifest.md`), poi la sessione è depositata
   nello store interattivo per il riuso in emissione/annullo.
3. Logging con `flow: "onboarding-verify"` in `src/lib/ade/log-failure.ts`.
4. Anti-frode trial: al primo claim della P.IVA si registra il suo HMAC
   (`src/lib/piva-hash.ts`) in `src/db/schema/trial-vat-ledger.ts` (registro che
   sopravvive alla cancellazione dell'account). Se la P.IVA è già presente →
   `trialStartedAt = null` → sola lettura immediata via i gate esistenti in
   `src/lib/plans-shared.ts`.

## Recovery stale-pending AdE

Un documento rimasto "pending" (es. crash dopo la chiamata AdE) viene
riconciliato da `src/lib/services/ade-recovery.ts`, con la soglia temporale
descritta nella skill `stripe-webhooks` e in `docs/architecture/config-manifest.md`.
Prima di ri-sottomettere ad AdE, il recovery interroga `searchDocuments`
(HAR di riferimento: `ricerca.har`, locale e gitignorata) e riconcilia il
documento con la fonte di verità via
`reconcileSaleDocument`/`reconcileVoidDocument`: se AdE l'aveva già accettato →
finalize-only (nessun duplicato fiscale), altrimenti re-submit; lookup
ambiguo o fallito → resta pending (fail-safe).

## Ciclo abbonamento Stripe

1. Checkout/portal da `src/server/billing-actions.ts` (wrapper SDK in
   `src/lib/stripe.ts`).
2. Webhook firmato → `src/app/api/stripe`; gli eventi processati aggiornano il
   piano su `src/db/schema/profiles.ts` (idempotenza via
   `src/db/schema/stripe-webhook-events.ts`).
3. API version `2026-06-24.dahlia` e gli 8 eventi obbligatori → skill
   `stripe-webhooks` + `CLAUDE.md`.

## Osservabilità ed errori

1. Tutto passa da `src/lib/logger.ts` (pino). `warn` resta nei log; `error`
   (level ≥ 50) emette anche `Sentry.captureException`.
2. AdE: `src/lib/ade/log-failure.ts` decide il ramo — `ade_user_error`/
   `ade_transient` → solo `warn`; `ade_failure` → Sentry con fingerprint per
   `flow` (regole 20/23).
3. Rumore di rete client filtrato in `src/lib/sentry-filters.ts`
   (`sentry.client.config.ts`, `beforeSend`).
4. Validazione drain + smoke post-deploy via `src/app/api/_debug` e
   `src/app/api/_health` (regole 21/25, skill `sentry-hygiene`).
