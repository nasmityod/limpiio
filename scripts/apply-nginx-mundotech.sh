#!/usr/bin/env bash
# Aplica deploy/nginx/sites-available/mundotech → /etc/nginx/sites-available/mundotech
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/deploy/nginx/sites-available/mundotech"
DEST="/etc/nginx/sites-available/mundotech"

if [[ ! -f "$SRC" ]]; then
  echo "No se encontró $SRC"
  exit 1
fi

cp "$SRC" "$DEST"
nginx -t
systemctl reload nginx
echo "OK: nginx recargado con client_max_body_size 100m"
