#!/usr/bin/env bash
# Instala/actualiza el crontab de root desde deploy/crontab.vps de forma idempotente.
# Hace backup del crontab actual antes de reemplazarlo.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/deploy/crontab.vps"
[ -f "$SRC" ] || { echo "No existe $SRC" >&2; exit 1; }

# --- Preflight: CRON_SECRET y wrapper BCV ---
APP_SLUG="${APP_SLUG:-storefront}"
ENV_FILE="${APP_ENV_FILE:-/etc/${APP_SLUG}/${APP_SLUG}.env}"
[[ "$APP_SLUG" =~ ^[a-zA-Z0-9_-]+$ && "$ENV_FILE" =~ ^/[a-zA-Z0-9_./-]+$ ]] || {
  echo "ERROR: APP_SLUG o APP_ENV_FILE no es seguro para una línea cron." >&2; exit 1;
}
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

backup_file="$(mktemp)"
install_file="$(mktemp)"
trap 'rm -f "$backup_file" "$install_file"' EXIT
chmod 600 "$backup_file" "$install_file"
crontab -l 2>/dev/null > "$backup_file" || true
bash "$ROOT/scripts/lib/render-crontab.sh" "$backup_file" "$SRC" "$APP_SLUG" "$ENV_FILE" > "$install_file"
cp "$backup_file" "/tmp/crontab.bak.$(date +%Y%m%d%H%M%S)"
crontab "$install_file"
echo "==> Crontab instalado desde $SRC:"
crontab -l
