#!/usr/bin/env bash
# FASE 4.7 (MEJORA 4.2) — backup diario de PostgreSQL a Cloudflare R2.
#
#   1. pg_dump (formato custom -F c, ya comprimido) usando DIRECT_URL del .env
#      del repo (conexión directa, NUNCA el pooler).
#   2. Sube el dump al bucket PRIVADO de R2 (R2_PRIVATE_BUCKET_NAME) bajo
#      backups/ (scripts/lib/backup-r2.mjs). NUNCA al bucket público del CDN.
#   3. Retención: borra objetos de R2 con más de 30 días.
#   4. Conserva además una copia local (últimos 7 días) como caché rápida.
#
# Cron sugerido (TZ America/Caracas, ver scripts/install-crontab.sh):
#   0 3 * * * /var/www/$APP_SLUG/scripts/backup-postgres.sh >> /var/log/$APP_SLUG-backup.log 2>&1
#
# RESTORE (runbook — probado el 2026-07-03):
#   1. Descarga el dump desde R2 (dashboard Cloudflare → R2 → bucket → backups/)
#      o con: node scripts/lib/restore-list-r2.mjs (listar) + presigned URL.
#   2. pg_restore --clean --if-exists -d "$DIRECT_URL" <slug>_YYYYMMDD_HHMMSS.dump
#      (usa DIRECT_URL, no el pooler. --clean recrea objetos; hazlo con la app
#      detenida: sudo systemctl stop "$APP_SLUG").
#   3. sudo systemctl start "$APP_SLUG" && curl -s localhost:3000/api/health
set -euo pipefail
umask 077

# Nombre de la instancia: prefija los dumps para no mezclar backups de
# varias tiendas en el mismo directorio ni en el mismo bucket.
APP_SLUG="${APP_SLUG:-storefront}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCAL_DIR="/home/deploy/backups"
LOCAL_RETENTION_DAYS=7

mkdir -p "$LOCAL_DIR"

# Same environment file as systemd/deploy; no credential-bearing argv.
ENV_FILE="${APP_ENV_FILE:-/etc/${APP_SLUG}/${APP_SLUG}.env}"
[[ -r "$ENV_FILE" ]] || { echo "[backup] ERROR: entorno no legible: $ENV_FILE" >&2; exit 1; }
set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a
[[ "$APP_SLUG" =~ ^[a-zA-Z0-9_-]+$ ]] || { echo '[backup] ERROR: instancia inválida' >&2; exit 1; }
DIRECT_URL="${DIRECT_URL:-}"
if [[ -z "$DIRECT_URL" ]]; then
  echo "[backup] ERROR: DIRECT_URL no configurado" >&2
  exit 1
fi

TS="$(date +%Y%m%d_%H%M%S)"
DUMP="$LOCAL_DIR/${APP_SLUG}_${TS}.dump"

echo "[backup] $(date -Is) pg_dump → $DUMP"
# SEC-2026-09: la URI (con contraseña) viaja por entorno, no por argv —
# `pg_dump --dbname=postgres://user:pass@…` era visible en `ps` para cualquier
# usuario local del VPS. libpq acepta una URI completa en PGDATABASE.
PGDATABASE="$DIRECT_URL" pg_dump -F c -f "$DUMP"
chmod 600 "$DUMP"

echo "[backup] subiendo a R2 + retención 30 días…"
cd "$ROOT"
node scripts/lib/backup-r2.mjs "$DUMP"

# Copia local: solo los últimos N días (el histórico completo vive en R2).
find "$LOCAL_DIR" -maxdepth 1 -type f -regextype posix-extended -regex "$LOCAL_DIR/${APP_SLUG}_[0-9]{8}_[0-9]{6}\.dump" -mtime "+${LOCAL_RETENTION_DAYS}" -delete

echo "[backup] $(date -Is) OK"
