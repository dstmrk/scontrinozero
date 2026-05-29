#!/usr/bin/env bash
#
# ScontrinoZero — deploy dev sul Raspberry Pi.
# Invocato da adnanh/webhook (vedi hooks.json) dopo ogni push su main:
# scarica l'ultima immagine :dev da GHCR e riavvia il container.
#
# Idempotente: se l'immagine non è cambiata, `up -d` è un no-op.
set -euo pipefail

# Lavora sempre nella cartella dello script (dove sta docker-compose.yml + .env).
cd "$(dirname "$(readlink -f "$0")")"

log() { echo "[deploy-dev] $(date -Is) $*"; }

log "pull immagine :dev"
docker compose pull app

log "restart container"
docker compose up -d app

# Libera spazio sulla SD: rimuove le vecchie :dev ormai dangling.
docker image prune -f >/dev/null 2>&1 || true

log "fatto"
