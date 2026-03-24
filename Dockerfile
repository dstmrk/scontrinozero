# =============================================================================
# Stage 1: Dependencies
# =============================================================================
FROM node:22-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install -g npm@11.12.0 && npm ci --ignore-scripts

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
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

CMD ["sh", "-c", "node --dns-result-order=ipv4first migrate.js && exec node --dns-result-order=ipv4first server.js"]
