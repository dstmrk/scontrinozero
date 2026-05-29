# Ambiente DEV — Raspberry Pi 5 (arm64)

Deploy automatico di `dev.scontrinozero.it` (+ `app-dev` / `api-dev`) a **ogni
push su `main`** (commit diretto o merge di PR).

## Architettura

```
push/merge su main
  └─ GitHub Actions (.github/workflows/deploy-dev.yml)
        runner ubuntu-24.04-arm → build arm64 → push ghcr.io/dstmrk/scontrinozero:dev
        curl firmato (HMAC + CF Access) all'endpoint di deploy
  └─ Cloudflare Tunnel (cloudflared systemd sull'host)
        deploy-dev.scontrinozero.it → http://localhost:9000
  └─ adnanh/webhook (systemd) verifica la firma ed esegue deploy.sh
        docker compose pull && up -d  →  container scontrinozero-dev riparte
```

L'immagine `:dev` è **identica** a prod/sandbox (stesso `Dockerfile`), solo
compilata per arm64. Quasi tutte le differenze d'ambiente arrivano dal `.env`
a runtime: in modalità `standalone` il codice server legge le `NEXT_PUBLIC_*`
dalla env del container a ogni avvio/richiesta (Supabase, hostname, `APP_URL`).
L'unica `NEXT_PUBLIC_*` baked nel bundle al build è
`NEXT_PUBLIC_TURNSTILE_SITE_KEY` (letta in un client component): è passata come
build-arg e dev riusa la stessa key di prod. Sentry è disattivato su dev (nessun
`NEXT_PUBLIC_SENTRY_DSN` al build → DSN assente nel bundle).

## Setup sul Pi (una tantum)

> Sostituisci `pi` con il tuo utente reale (`whoami`) in tutti i path/file.

1. **Dismetti il vecchio meccanismo**: ferma lo script di polling ogni 2 min e
   l'`npm run` dentro code-server. Code-server resta, ma libera la porta 3000.

2. **Cartella e file applicativi**:
   ```bash
   mkdir -p ~/docker-apps/scontrinozero-dev
   cd ~/docker-apps/scontrinozero-dev
   # copia da questa cartella del repo:
   #   docker-compose.yml  deploy.sh  hooks.json
   chmod +x deploy.sh
   cp .env.example .env   # poi compila .env con i valori DEV
   ```
   Puoi riusare il tuo vecchio `.env.local` come `.env`: le chiavi coincidono.

3. **Docker senza sudo** per il tuo utente:
   ```bash
   sudo usermod -aG docker pi   # poi ri-login
   ```

4. **Receiver webhook (systemd)**:
   ```bash
   sudo apt-get install -y webhook
   # genera il secret HMAC (lo stesso che metterai nei GitHub Secrets):
   echo "DEPLOY_HMAC_SECRET=$(openssl rand -hex 32)" > webhook.env
   chmod 600 webhook.env
   # installa il service (adatta 'pi' dentro al file prima di copiarlo):
   sudo cp webhook.service /etc/systemd/system/scontrinozero-dev-webhook.service
   sudo systemctl daemon-reload
   sudo systemctl enable --now scontrinozero-dev-webhook
   ```
   Il receiver ascolta solo su `127.0.0.1:9000`.

5. **Cloudflared (systemd sull'host)** — aggiungi l'ingress *prima* della
   catch-all `http_status:404`, poi crea la rotta DNS:
   ```yaml
   ingress:
     - hostname: deploy-dev.scontrinozero.it
       service: http://localhost:9000
     # ... dev / app-dev / api-dev -> http://localhost:3000 ...
     - service: http_status:404
   ```
   ```bash
   cloudflared tunnel route dns <NOME_O_ID_TUNNEL> deploy-dev.scontrinozero.it
   sudo systemctl restart cloudflared
   ```
   Proteggi `deploy-dev.scontrinozero.it` con una **Cloudflare Access
   Application + Service Token**.

6. **Primo avvio**:
   ```bash
   cd ~/docker-apps/scontrinozero-dev
   docker compose up -d
   ```

## GitHub Secrets (repo dstmrk/scontrinozero)

| Secret                    | Valore                                                                 |
| ------------------------- | ---------------------------------------------------------------------- |
| `DEPLOY_WEBHOOK_URL`      | `https://deploy-dev.scontrinozero.it/hooks/scontrinozero-dev-deploy`   |
| `DEPLOY_HMAC_SECRET`      | lo stesso valore messo in `webhook.env` sul Pi                         |
| `CF_ACCESS_CLIENT_ID`     | Client ID del Service Token di Cloudflare Access                       |
| `CF_ACCESS_CLIENT_SECRET` | Client Secret del Service Token di Cloudflare Access                   |

`GITHUB_TOKEN` (push su GHCR) è automatico, nessun secret da creare.

## Sicurezza del webhook (doppio livello)

1. **Cloudflare Access** all'edge: senza il Service Token la richiesta non
   raggiunge nemmeno il Pi.
2. **HMAC-SHA256** sul body (`X-Hub-Signature-256`): `webhook` rifiuta ogni
   richiesta non firmata con `DEPLOY_HMAC_SECRET`.

## Verifica / debug

```bash
# stato container e receiver
docker compose ps
systemctl status scontrinozero-dev-webhook
# log
docker compose logs -f app
journalctl -u scontrinozero-dev-webhook -f
# test manuale del deploy (senza passare da GitHub)
./deploy.sh
```

## Note

- `app-dev.scontrinozero.it/` potrebbe mostrare la landing marketing invece di
  redirigere a `/dashboard`: il redirect build-time in `next.config.ts` usa
  l'hostname di default (prod), il runtime lo gestisce `src/proxy.ts`. È lo
  stesso comportamento della sandbox — irrilevante in dev.
- Sentry è disattivato su dev (nessun `NEXT_PUBLIC_SENTRY_DSN` nel `.env`).
