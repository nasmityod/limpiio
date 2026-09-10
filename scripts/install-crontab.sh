#!/usr/bin/env bash
# Instala/actualiza el crontab de root desde deploy/crontab.vps de forma idempotente.
# Hace backup del crontab actual antes de reemplazarlo.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/deploy/crontab.vps"
[ -f "$SRC" ] || { echo "No existe $SRC" >&2; exit 1; }

# --- Preflight: CRON_SECRET y wrapper BCV ---
ENV_FILE="${MUNDOTECH_ENV_FILE:-/etc/mundotech/mundotech.env}"
BCV_RUNNER="$ROOT/scripts/run-bcv-cron.sh"

if [[ ! -r "$ENV_FILE" ]]; then
  echo "ERROR: no se puede leer $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a

if [[ -z "${CRON_SECRET:-}" ]]; then
  echo "ERROR: CRON_SECRET falta en $ENV_FILE" >&2
  exit 1
fi

if [[ ! -x "$BCV_RUNNER" ]]; then
  echo "ERROR: runner BCV no existe o no es ejecutable: $BCV_RUNNER" >&2
  exit 1
fi
# --- Fin preflight ---

crontab -l 2>/dev/null > "/tmp/crontab.bak.$(date +%Y%m%d%H%M%S)" || true
crontab "$SRC"
echo "==> Crontab instalado desde $SRC:"
crontab -l
