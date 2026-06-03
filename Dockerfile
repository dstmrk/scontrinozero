# =============================================================================
# Stage 1: Dependencies
# =============================================================================
FROM node:22-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# =============================================================================
# Stage 2: Build
# =============================================================================
FROM node:22-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* vars — inlined nel bundle JS da Next.js a build time
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY

# Identity hostnames/URL — valutati sia al BUILD (marketing SSG, next.config
# redirects/headers, metadataBase) sia nel bundle client (appHref in
# header.tsx). Prod/sandbox NON li passano → restano vuoti → fallback al
# default app.scontrinozero.it (corretto per prod). L'immagine :dev li passa
# coi valori dev così link auth, redirect /→/dashboard e CORS puntano a
# app-dev. Vedi deploy/dev/. (Coerente con CLAUDE.md regola 15.)
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_APP_HOSTNAME
ARG NEXT_PUBLIC_MARKETING_HOSTNAME
ARG NEXT_PUBLIC_API_HOSTNAME
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_APP_HOSTNAME=$NEXT_PUBLIC_APP_HOSTNAME
ENV NEXT_PUBLIC_MARKETING_HOSTNAME=$NEXT_PUBLIC_MARKETING_HOSTNAME
ENV NEXT_PUBLIC_API_HOSTNAME=$NEXT_PUBLIC_API_HOSTNAME

# Sentry plugin vars — servono per uploadare le source maps
ARG SENTRY_ORG
ARG SENTRY_PROJECT
ENV SENTRY_ORG=$SENTRY_ORG
ENV SENTRY_PROJECT=$SENTRY_PROJECT

ENV NEXT_TELEMETRY_DISABLED=1
ENV NO_UPDATE_NOTIFIER=1
# SENTRY_AUTH_TOKEN passato come BuildKit secret (non scritto in nessun layer)
RUN --mount=type=secret,id=sentry_auth_token,env=SENTRY_AUTH_TOKEN npm run build

RUN npx esbuild scripts/migrate.ts \
    --bundle \
    --platform=node \
    --outfile=.next/standalone/migrate.js

# =============================================================================
# Stage 3: Production
# =============================================================================
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# SHA del commit buildato — letto a runtime dal Server Component /dashboard/settings
ARG BUILD_SHA
ENV BUILD_SHA=$BUILD_SHA

# Canale build: "dev" solo per l'immagine :dev (deploy-dev.yml), così la card
# Informazioni mostra "build dev <sha>" invece del bare SHA di prod. Vuoto in
# prod/sandbox/self-host.
ARG BUILD_CHANNEL
ENV BUILD_CHANNEL=$BUILD_CHANNEL

RUN apk upgrade --no-cache && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    # npm is not needed at runtime; removing it eliminates its bundled
    # transitive deps (glob, minimatch, tar) from Trivy CVE scans
    npm uninstall -g npm && \
    rm -rf /usr/lib/node_modules/npm

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/supabase/migrations ./supabase/migrations

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health/live || exit 1

CMD ["sh", "-c", "node --dns-result-order=ipv4first migrate.js && exec node --dns-result-order=ipv4first server.js"]
