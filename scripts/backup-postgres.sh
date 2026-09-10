#!/usr/bin/env bash
# FASE 4.7 (MEJORA 4.2) — backup diario de PostgreSQL a Cloudflare R2.
#
#   1. pg_dump (formato custom -F c, ya comprimido) usando DIRECT_URL del .env
#      del repo (conexión directa, NUNCA el pooler).
#   2. Sube el dump a R2 bajo backups/ (scripts/lib/backup-r2.mjs).
#   3. Retención: borra objetos de R2 con más de 30 días.
#   4. Conserva además una copia local (últimos 7 días) como caché rápida.
#
# Cron sugerido (TZ America/Caracas, ver scripts/install-crontab.sh):
#   0 3 * * * /var/www/mundotech/scripts/backup-postgres.sh >> /var/log/mundotech-backup.log 2>&1
#
# RESTORE (runbook — probado el 2026-07-03):
#   1. Descarga el dump desde R2 (dashboard Cloudflare → R2 → bucket → backups/)
#      o con: node scripts/lib/restore-list-r2.mjs (listar) + presigned URL.
#   2. pg_restore --clean --if-exists -d "$DIRECT_URL" mundotech_YYYYMMDD_HHMMSS.dump
#      (usa DIRECT_URL, no el pooler. --clean recrea objetos; hazlo con la app
#      detenida: sudo systemctl stop mundotech).
#   3. sudo systemctl start mundotech && curl -s localhost:3000/api/health
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCAL_DIR="/home/deploy/backups"
LOCAL_RETENTION_DAYS=7

mkdir -p "$LOCAL_DIR"

# DIRECT_URL desde el .env del repo (sin exportar todo el archivo).
DIRECT_URL="$(grep -E '^DIRECT_URL=' "$ROOT/.env" | head -1 | cut -d= -f2- | tr -d '"')"
if [[ -z "$DIRECT_URL" ]]; then
  echo "[backup] ERROR: DIRECT_URL no encontrado en $ROOT/.env" >&2
  exit 1
fi

TS="$(date +%Y%m%d_%H%M%S)"
DUMP="$LOCAL_DIR/mundotech_${TS}.dump"

echo "[backup] $(date -Is) pg_dump → $DUMP"
pg_dump --dbname="$DIRECT_URL" -F c -f "$DUMP"

echo "[backup] subiendo a R2 + retención 30 días…"
cd "$ROOT"
node scripts/lib/backup-r2.mjs "$DUMP"

# Copia local: solo los últimos N días (el histórico completo vive en R2).
find "$LOCAL_DIR" -name "mundotech_*.dump" -mtime "+${LOCAL_RETENTION_DAYS}" -delete

echo "[backup] $(date -Is) OK"
