# Umami — web analytics self-hosted (cookieless)

Runbook per predisporre l'istanza **Umami** sul VPS di produzione e attivarla
nell'app. Umami è la scelta analytics del progetto (GDPR-by-design, nessun
cookie → nessun consenso; vedi cookie policy `/cookie-policy`). È un **servizio
separato** dall'app Next.js: gira in un suo container con un suo database.

> Il codice app è **env-gated**: finché i due build-arg non sono valorizzati e
> l'immagine ricompilata, loader (`src/components/umami-script.tsx`) e allowance
> CSP (`src/lib/csp.ts`) sono **no-op**. Nulla si rompe se salti questo runbook.

## Architettura

```
browser ──▶ analytics.scontrinozero.it (Cloudflare Tunnel)
              └─ cloudflared (host) ──▶ http://localhost:3001 (container umami)
                                             └─ postgres (container dedicato)
app.scontrinozero.it/*  ──▶ <script src=".../script.js" data-website-id=...>
                             └─ POST .../api/send  (pageview + eventi custom)
```

Origin `https://analytics.scontrinozero.it` è allowlistato in CSP `script-src`
e `connect-src` (derivato automaticamente da `NEXT_PUBLIC_UMAMI_SRC`).

## 1. Servizio Umami + DB (sul VPS)

Aggiungi uno stack compose dedicato (es. `/opt/umami/docker-compose.yml`).
**Non** riusare il DB dell'app: Umami vuole il suo schema.

```yaml
services:
  umami:
    image: ghcr.io/umami-software/umami:postgresql-latest
    container_name: umami
    restart: unless-stopped
    ports:
      - "127.0.0.1:3001:3000" # solo loopback: espone via Cloudflare Tunnel
    environment:
      DATABASE_URL: postgresql://umami:${UMAMI_DB_PASSWORD}@umami-db:5432/umami
      DATABASE_TYPE: postgresql
      APP_SECRET: ${UMAMI_APP_SECRET} # openssl rand -hex 32
      DISABLE_TELEMETRY: "1"
    depends_on:
      umami-db:
        condition: service_healthy
    mem_limit: 256m

  umami-db:
    image: postgres:16-alpine
    container_name: umami-db
    restart: unless-stopped
    environment:
      POSTGRES_DB: umami
      POSTGRES_USER: umami
      POSTGRES_PASSWORD: ${UMAMI_DB_PASSWORD}
    volumes:
      - umami-db-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U umami"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  umami-db-data:
```

Avvia: `docker compose up -d`. Login iniziale Umami: `admin` / `umami` →
**cambia subito la password**.

## 2. Cloudflare Tunnel

Aggiungi l'ingress per il subdomain nella config `cloudflared` dell'host (stesso
pattern degli altri subdomain, vedi `deploy/dev/README.md`):

```yaml
ingress:
  - hostname: analytics.scontrinozero.it
    service: http://localhost:3001
  # ... altri ingress ...
  - service: http_status:404
```

Crea il record DNS `analytics` sul tunnel e riavvia `cloudflared`.

## 3. Crea il sito e prendi il website ID

Nella dashboard Umami → **Settings → Websites → Add website**:

- Name: `ScontrinoZero`
- Domain: `app.scontrinozero.it`

Copia il **Website ID** (UUID) generato.

## 4. Attiva nell'app (rebuild — sono baked!)

Le due variabili sono `NEXT_PUBLIC_*` → **baked al build** (regola 18 di
`CLAUDE.md`): non basta editare il `.env`, serve ricompilare l'immagine.

Imposta i due **GitHub secrets** usati da `.github/workflows/deploy.yml`:

- `NEXT_PUBLIC_UMAMI_SRC` = `https://analytics.scontrinozero.it/script.js`
- `NEXT_PUBLIC_UMAMI_WEBSITE_ID` = `<UUID del passo 3>`

Poi rilascia una nuova versione (tag `vX.Y.Z`) → il workflow li passa come
`--build-arg`. Sul VPS: `docker compose pull && docker compose up -d`.

> Dev/sandbox restano **off**: `deploy-dev.yml` non passa i build-arg (come
> Sentry su dev), così il traffico non-prod non inquina le analytics.

## 5. Validazione drain (obbligatoria)

Spirito regola 21/25: il rollout **non è concluso** finché non vedi il dato.

1. Apri `https://app.scontrinozero.it` e naviga qualche pagina.
2. In DevTools → Network verifica `script.js` (200) e le POST a `/api/send`
   verso `analytics.scontrinozero.it` (non bloccate da CSP).
3. Nella dashboard Umami: il **pageview** deve comparire entro pochi minuti.
4. Emetti uno scontrino di test → l'evento `receipt_emitted` compare in
   **Events**.

Se il pageview non arriva → integrazione rotta (CSP, build-arg dimenticato,
tunnel): bloccante, non considerare il deploy concluso.

## Eventi custom tracciati

Definiti in `src/lib/umami.ts` (`UMAMI_EVENTS`), inviati via `track()`:

| Evento                      | Dove                                    | Dati        |
| --------------------------- | --------------------------------------- | ----------- |
| `receipt_emitted`           | emissione scontrino OK (`cassa-client`) | —           |
| `plan_upgrade_click`        | CTA checkout (`checkout-button`)        | `{priceId}` |
| `onboarding_step_completed` | step del tour (`onboarding-tour`)       | `{step}`    |

Nomi **stabili**: cambiarli spezza la continuità storica del report.
