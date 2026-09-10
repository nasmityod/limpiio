#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${MUNDOTECH_ENV_FILE:-/etc/mundotech/mundotech.env}"
ENDPOINT="${MUNDOTECH_BCV_ENDPOINT:-http://127.0.0.1:3000/api/cron/update-bcv-rate}"

log() {
  printf '%s %s\n' "$(date --iso-8601=seconds)" "$*"
}

if [[ ! -r "$ENV_FILE" ]]; then
  log "ERROR env_file_not_readable path=$ENV_FILE"
  exit 1
fi

set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a

if [[ -z "${CRON_SECRET:-}" ]]; then
  log "ERROR cron_secret_missing"
  exit 1
fi

response_file="$(mktemp)"
trap 'rm -f "$response_file"' EXIT

set +e
http_code="$(
  curl -sS \
    --max-time 30 \
    -o "$response_file" \
    -w '%{http_code}' \
    -H "Authorization: Bearer $CRON_SECRET" \
    "$ENDPOINT"
)"
curl_exit=$?
set -e

if [[ "$curl_exit" -ne 0 ]]; then
  log "ERROR curl_failed exit=$curl_exit"
  exit "$curl_exit"
fi

if [[ ! "$http_code" =~ ^[0-9]{3}$ ]]; then
  log "ERROR invalid_http_code"
  exit 1
fi

if [[ "$http_code" -lt 200 || "$http_code" -ge 300 ]]; then
  log "ERROR endpoint_http_status status=$http_code"
  cat "$response_file"
  printf '\n'
  exit 1
fi

if ! jq -e '.ok == true' "$response_file" >/dev/null 2>&1; then
  log "ERROR endpoint_ok_false status=$http_code"
  cat "$response_file"
  printf '\n'
  exit 1
fi

log "SUCCESS status=$http_code"
cat "$response_file"
printf '\n'
