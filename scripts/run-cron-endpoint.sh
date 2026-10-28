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
# APP_BASE_URL o PORT (por defecto http://127.0.0.1:3000).
set -euo pipefail

endpoint_name="${1:-}"
if [[ -z "$endpoint_name" || ! "$endpoint_name" =~ ^[a-z0-9-]+$ ]]; then
  echo "uso: $0 <nombre-del-cron>  (p. ej. abandoned-cart)" >&2
  exit 2
fi

APP_SLUG="${APP_SLUG:-storefront}"
[[ "$APP_SLUG" =~ ^[a-zA-Z0-9_-]+$ ]] || exit 2
ENV_FILE="${APP_ENV_FILE:-/etc/${APP_SLUG}/${APP_SLUG}.env}"
# Prevent overlapping invocations on this VPS; durable DB leases protect replicas.
exec 9>"/var/lock/${APP_SLUG}-${endpoint_name}.lock"
flock -n 9 || exit 0

log() { printf '%s [%s] %s\n' "$(date --iso-8601=seconds)" "$endpoint_name" "$*"; }

if [[ ! -r "$ENV_FILE" ]]; then
  log "ERROR env_file_not_readable path=$ENV_FILE"
  exit 1
fi

# Read only the values this runner needs; never execute/export the env file or
# pass unrelated application credentials to curl. Outer quotes are removed
# without deleting quote characters inside a secret or expanding shell code.
read_env_value() {
  local key="$1" line value
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    if [[ "$line" =~ ^[[:space:]]*(export[[:space:]]+)?${key}=(.*)$ ]]; then
      value="${BASH_REMATCH[2]}"
      case "$value" in
        \"*\") value="${value:1:-1}" ;;
        \'*\') value="${value:1:-1}" ;;
      esac
      printf '%s' "$value"
      return
    fi
  done < "$ENV_FILE"
}

CRON_SECRET="$(read_env_value CRON_SECRET)"
env_base_url="$(read_env_value APP_BASE_URL)"
env_port="$(read_env_value PORT)"
BASE_URL="${env_base_url:-${APP_BASE_URL:-http://127.0.0.1:${env_port:-${PORT:-3000}}}}"
BASE_URL="${BASE_URL%/}"
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
