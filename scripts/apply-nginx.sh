#!/usr/bin/env bash
# Aplica deploy/nginx/sites-available/app → /etc/nginx/sites-available/$APP_SLUG
set -euo pipefail

# Nombre de la instancia en el servidor (mismo valor que en deploy-vps.sh,
# ecosystem.config.js y deploy/crontab.vps).
APP_SLUG="${APP_SLUG:-storefront}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/deploy/nginx/sites-available/app"
DEST="/etc/nginx/sites-available/${APP_SLUG}"

if [[ ! -f "$SRC" ]]; then
  echo "No se encontró $SRC"
  exit 1
fi

cp "$SRC" "$DEST"
nginx -t
systemctl reload nginx
echo "OK: nginx recargado con client_max_body_size 100m"
