#!/usr/bin/env bash
# SEC-2026-09: invoca un endpoint /api/cron/* con el Bearer leído de un fichero
# temporal (curl -H @file) en vez de `-H "Authorization: Bearer $CRON_SECRET"`,
# que dejaba el secreto visible en `ps aux` para cualquier usuario local del
# VPS mientras durase la petición.
#
# Uso (crontab, ver deploy/crontab.vps):
#   /var/www/$APP_SLUG/scripts/run-cron-endpoint.sh abandoned-cart
#   /var/www/$APP_SLUG/scripts/run-cron-endpoint.sh purge-temporary-data
#
# Variables: APP_SLUG (instancia), APP_ENV_FILE (por defecto /etc/$APP_SLUG/$APP_SLUG.env),
# APP_BASE_URL (por defecto http://127.0.0.1:3000).
set -euo pipefail

endpoint_name="${1:-}"
if [[ -z "$endpoint_name" || ! "$endpoint_name" =~ ^[a-z0-9-]+$ ]]; then
  echo "uso: $0 <nombre-del-cron>  (p. ej. abandoned-cart)" >&2
  exit 2
fi

APP_SLUG="${APP_SLUG:-storefront}"
ENV_FILE="${APP_ENV_FILE:-/etc/${APP_SLUG}/${APP_SLUG}.env}"
BASE_URL="${APP_BASE_URL:-http://127.0.0.1:3000}"

log() { printf '%s [%s] %s\n' "$(date --iso-8601=seconds)" "$endpoint_name" "$*"; }

if [[ ! -r "$ENV_FILE" ]]; then
  log "ERROR env_file_not_readable path=$ENV_FILE"
  exit 1
fi

# Solo CRON_SECRET; no exportar el resto del entorno al proceso de curl.
CRON_SECRET="$(grep -E '^CRON_SECRET=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
if [[ -z "$CRON_SECRET" ]]; then
  log "ERROR cron_secret_missing"
  exit 1
fi

header_file="$(mktemp)"
response_file="$(mktemp)"
trap 'rm -f "$header_file" "$response_file"' EXIT
chmod 600 "$header_file"
printf 'Authorization: Bearer %s\n' "$CRON_SECRET" > "$header_file"
unset CRON_SECRET

set +e
http_code="$(curl -sS --max-time 120 -o "$response_file" -w '%{http_code}' -H "@$header_file" "$BASE_URL/api/cron/$endpoint_name")"
curl_exit=$?
set -e

if [[ "$curl_exit" -ne 0 ]]; then
  log "ERROR curl_failed exit=$curl_exit"
  exit "$curl_exit"
fi

log "http=$http_code body=$(head -c 300 "$response_file" | tr '\n' ' ')"
[[ "$http_code" =~ ^2 ]] || exit 1
