---
name: deploy-release
description: Use when deploying or releasing ScontrinoZero — tagging vX.Y.Z, building/pushing the Docker image to GHCR, docker compose on the VPS or the dev Raspberry Pi (deploy/dev/), passing NEXT_PUBLIC_* build-args (baked at build vs read at runtime, present-but-empty "" pitfalls where a ?? default never fires), identity env fail-fast validation (assertIdentityEnv in src/lib/identity-env.ts called from src/instrumentation.ts), the mandatory post-deploy smoke (live + env + drain probes on /api/health/live, /api/_health/env, /api/_debug/sentry-sentinel), Turnstile site-key/secret pairing for the :dev widget, env handling in next.config.ts, or updating the T&C / Privacy Policy version (CURRENT_TERMS_VERSION in src/server/auth-actions.ts).
---

# deploy-release — rilasci, env d'identità, smoke post-deploy, T&C

## Deploy produzione/sandbox (tag-based)

```
sviluppo → PR → merge main → CI
git tag vX.Y.Z → GitHub Actions: build Docker + push GHCR
VPS (Cloudflare Access SSH):
  cd /opt/scontrinozero && docker compose pull && docker compose up -d
```

## Deploy dev (push-based, Raspberry Pi)

A differenza di prod/sandbox (tag-based), **dev traccia `main`**: a ogni push
(commit o merge di PR) `deploy-dev.yml` builda l'immagine **arm64** su runner
`ubuntu-24.04-arm`, la pubblica come `ghcr.io/dstmrk/scontrinozero:dev` e
notifica il Pi via webhook firmato (HMAC + Cloudflare Access). Sul Pi
`adnanh/webhook` (systemd) esegue `docker compose pull && up -d`. Stessa
immagine di prod, solo arch diversa; tutte le differenze d'ambiente vivono nel
`.env` runtime. File e istruzioni in `deploy/dev/README.md`.

## Env: baked al build vs runtime

⚠️ Variabili `NEXT_PUBLIC_*` sono **baked al build** (non runtime): vanno
passate come `--build-arg` al `docker build`. `APP_HOSTNAME` (senza
`NEXT_PUBLIC_`) è runtime e sovrascrive l'hostname baked — usato per sandbox
e self-hosting su dominio custom.

Un'unica immagine Docker serve prod/sandbox/dev/self-hosted. Molte
`NEXT_PUBLIC_*` (Supabase, Stripe) sono lette **server-side a runtime** in
standalone e bastano nel `.env`. MA quelle d'**identità** (`NEXT_PUBLIC_APP_URL`,
`_APP_HOSTNAME`, `_MARKETING_HOSTNAME`, `_API_HOSTNAME`) sono valutate anche al
**build** (marketing SSG, `next.config` redirects/headers, `metadataBase`) e
finiscono nel bundle client (`appHref` in `header.tsx`, client component):
vanno passate come `--build-arg` se servono valori non-prod. Il `Dockerfile`
le accetta; prod **non** le passa (→ default `app.scontrinozero.it`),
l'immagine `:dev` sì (→ `app-dev`). Sandbox condivide l'immagine prod → su
questi link resta sul default prod (limite noto). Idem
`NEXT_PUBLIC_TURNSTILE_SITE_KEY` (`turnstile-widget.tsx`) e
`NEXT_PUBLIC_SENTRY_DSN` (`sentry.client.config.ts`). Coerente con la regola
15 di `CLAUDE.md` (link auth marketing → app via `appHref()`).

### Turnstile per dev

`:dev` baka un **widget Turnstile dedicato** (secret
`NEXT_PUBLIC_TURNSTILE_SITE_KEY_DEV` in `deploy-dev.yml`, fallback alla key
prod se assente). ⚠️ Site key bakata e `TURNSTILE_SECRET_KEY` runtime nel
`.env` del Pi **devono essere dello stesso widget**: la `NEXT_PUBLIC_*` è
baked → la riga `NEXT_PUBLIC_TURNSTILE_SITE_KEY` nel `.env` del Pi è ignorata.
Mismatch → siteverify risponde `invalid-input-secret` (secret non
riconosciuta) o `invalid-input-response` (token di un altro widget), e ogni
login fallisce con "Verifica CAPTCHA fallita". Diagnosi dall'`errorClass` in
`auth-actions.ts` (`captcha_verification_failed`).

## Present-but-empty e next.config.ts (regola 18)

Un `?? default` **non** scatta se la variabile è presente ma **vuota** (`""`):
nel `Dockerfile` bakare un default reale nell'`ARG`/`ENV` o **non** esportarla
affatto quando assente, altrimenti prod/sandbox bakano una stringa vuota
(CORS origin / reporting endpoint vuoti — PR #560).

E `next.config.ts` **non** può importare moduli con alias `@/`: la
transpilation del config non li risolve e `next build` fallisce _prima_ di
generare le route — usare import relativi (PR #536).

## Validazione fail-fast al boot (regola 24)

Le env che producono URL/redirect (`NEXT_PUBLIC_APP_URL` + le 6 varianti
`*_HOSTNAME`) sono validate da `assertIdentityEnv()` in
`src/lib/identity-env.ts`, chiamato come **prima istruzione** di `register()`
in `src/instrumentation.ts` (runtime nodejs). In produzione un valore
malformato fa **throware al boot** e il container non parte — invece di
produrre 503 al primo route che costruisce URL, come succedeva con
SCONTRINOZERO-F (5 eventi su utente FR/Stripe checkout) e SCONTRINOZERO-D
(action_link hostname mismatch). In dev/test la stessa validation logga
`warn` ma non blocca il loop.

Il check copre tre classi di failure: malformed URL/hostname,
present-but-empty (sezione sopra: `?? default` non scatta su `""`), e `http`
invece di `https` in prod. Le guardie lazy esistenti (`getTrustedAppUrl()`,
`parseTrustedHostnameEnv()`) restano in piedi come secondo strato — defense
in depth, non vanno toccate.

## Smoke post-deploy: tre health probe (regola 25 — fonte canonica)

Dopo ogni rollout (prod o sandbox o `:dev` Pi), prima di considerare il
deploy "concluso" hit i tre health probe e verifica la response:

```bash
curl -fsS https://<host>/api/health/live
curl -fsS https://<host>/api/_health/env | jq .
curl -fsS -H "x-sentinel-token: $TOKEN" \
  "https://<host>/api/_debug/sentry-sentinel?id=v$VERSION"
```

- `/api/health/live` (`src/app/api/health/live/route.ts`) → 200 = process
  up, event loop responsive.
- `/api/_health/env` (`src/app/api/_health/env/route.ts`) → 200 con
  `{ appUrl, release, hostnames }`. **Confronta `release` e `appUrl` con
  quanto rilasciato**: una `:dev` con `appUrl: app.scontrinozero.it` è un
  Dockerfile build-arg dimenticato. 503 = identity env rotta anche dopo la
  validazione al boot (es. rotazione secret tra boot e prima request).
- `/api/_debug/sentry-sentinel` → 200 + `sentryQuery` da incollare in Sentry
  per validare il drain (regola 21). Endpoint:
  `src/app/api/_debug/sentry-sentinel/route.ts` — protetto da timing-safe
  compare, risponde 404 se il token (`SENTRY_SENTINEL_TOKEN`) è assente o non
  combacia (esistenza nascosta a chi non ha il secret). La sentinella emette
  sia nel dataset `logs` sia nel pannello issues (l'`error` passa da
  `Sentry.captureException` via il hook a `level≥50` in `src/lib/logger.ts`).
  **Il deploy di una feature di telemetria non è concluso finché la
  sentinella non appare in dashboard entro ~5 minuti**; se non appare →
  integrazione rotta = bug bloccante, rollback o riapri la PR. Query lato
  Sentry (`errorClass:sentinel sentinelId:v$VERSION`) → skill `sentry-hygiene`.

Il pattern è "live + env + drain": catturava `@react-email/render` mancante
(SCONTRINOZERO-B, gap dev container vs standalone), `NEXT_PUBLIC_APP_URL`
malformato (SCONTRINOZERO-F) e l'`action_link` hostname mismatch
(SCONTRINOZERO-D) **al primo rollout**, non al primo utente. Storico regola
21: v1.3.6 (rollout `Sentry.pinoIntegration`) — il dataset `logs` era vuoto
al momento dell'analisi e non si poteva distinguere "drain rotto" da
"rilasciato 40 minuti fa". Integrazione in CI rimandata: oggi è uno script
da eseguire manualmente dopo `docker compose up -d`.

## Procedura aggiornamento T&C

1. Crea `src/app/(marketing)/termini/v*/page.tsx` (nuova versione vXX)
2. Aggiorna redirect in `src/app/(marketing)/termini/page.tsx` → `/termini/vXX`
3. Aggiorna `CURRENT_TERMS_VERSION = "vXX"` in `src/server/auth-actions.ts`
4. Aggiorna il **secondo flag** (clausole vessatorie art. 1341 c.c.) in
   `src/app/(auth)/register/page.tsx` con i nuovi numeri di paragrafo

Privacy Policy: stessa procedura, aggiungere anche a `sitemap.ts`,
`sitemap.test.ts` e `sonar.coverage.exclusions`. Notifica utenti ≥15 giorni
prima dell'entrata in vigore.
