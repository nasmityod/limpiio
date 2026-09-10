#!/usr/bin/env bash
# Despliegue atómico en VPS (FASE 1 — AUDITORIA-EXHAUSTIVA-2026-07 INF-01/INF-02):
#
#   1. Compila en un directorio de staging (.next-staging) SIN detener el servicio
#      → cero downtime durante los minutos que dura el build.
#   2. Hereda a staging los chunks estáticos de builds anteriores (content-hashed,
#      inmutables) → clientes/CDN con HTML viejo siguen encontrando sus chunks
#      en vez de recibir 404/500 text/plain (la causa raíz del reporte PageSpeed).
#   3. Swap atómico: stop → mv .next → start (segundos, no minutos).
#   4. Health-check con rollback automático al build anterior si el nuevo no arranca.
#   5. Purga opcional de caché Cloudflare (si CF_ZONE_ID + CF_API_TOKEN están en
#      /etc/mundotech/mundotech.env) para que ningún HTML viejo quede cacheado.
#
# NUNCA correr `npm run build` a mano en producción sin este script: el server
# en ejecución mantiene el manifest viejo en memoria y el HTML ISR regenerado
# apuntará a chunks que ya no existen en disco.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
SERVICE="${MUNDOTECH_SERVICE:-mundotech.service}"
STAGING=".next-staging"
CURRENT=".next"
PREVIOUS=".next-previous"
HEALTH_URL="http://127.0.0.1:3000/api/health"
# Chunks heredados de builds viejos se limpian pasados N días (los clientes con
# HTML de hace más de una semana ya recargaron; el header immutable dura 1 año
# pero el HTML ISR expira en 5 min).
STALE_STATIC_DAYS=14

log() { echo "==> $*"; }

# shellcheck source=scripts/lib/cloudflare-purge.sh
source "$ROOT/scripts/lib/cloudflare-purge.sh"

# ── 0. Cargar y validar configuración de entorno ─────────────────────────────
# El archivo de entorno es la fuente única de verdad para CHECKOUT_MODE.
# El proceso Node (systemd) y el build deben usar exactamente el mismo valor.
ENV_FILE="${MUNDOTECH_ENV_FILE:-/etc/mundotech/mundotech.env}"

if ! sudo test -r "$ENV_FILE"; then
  echo "ERROR: no se puede leer el archivo de entorno '${ENV_FILE}'." >&2
  echo "       Verifica que existe y que el usuario de deploy tiene acceso sudo a él." >&2
  echo "       Para cambiar la ruta usa: MUNDOTECH_ENV_FILE=/ruta/alternativa npm run deploy:vps" >&2
  exit 1
fi

# Carga las variables sin imprimirlas (set -a exporta todo lo definido).
set -a
# shellcheck source=/dev/null
source <(sudo cat "$ENV_FILE")
set +a

# Valida CHECKOUT_MODE antes de arrancar el build.
MODE="${CHECKOUT_MODE:-}"
if [[ "$MODE" != "whatsapp" && "$MODE" != "full" ]]; then
  echo "ERROR: CHECKOUT_MODE='${MODE}' no es válido." >&2
  echo "       Valores aceptados: whatsapp | full" >&2
  echo "       Edita ${ENV_FILE} y establece CHECKOUT_MODE=whatsapp o CHECKOUT_MODE=full." >&2
  exit 1
fi

log "Modo de checkout para este build: ${MODE}"

# ── 1. Build en staging (servicio sigue arriba) ─────────────────────────────
log "Build de producción en ${STAGING} (el servicio sigue sirviendo el build actual)…"
rm -rf "$STAGING"
NEXT_BUILD_DIR="$STAGING" npm run build

if [[ ! -f "$STAGING/BUILD_ID" ]]; then
  echo "ERROR: build incompleto — no existe $STAGING/BUILD_ID" >&2
  exit 1
fi

# ── 2. Heredar estáticos de builds anteriores (no-clobber) ──────────────────
# Los archivos de _next/static llevan hash de contenido → inmutables. Copiar los
# del build actual que no existan en el nuevo evita la ventana de chunks rotos.
if [[ -d "$CURRENT/static" ]]; then
  log "Heredando chunks estáticos del build anterior (gracia para HTML cacheado)…"
  cp -an "$CURRENT/static/." "$STAGING/static/" 2>/dev/null || true
  # Limpieza: chunks heredados con más de N días.
  find "$STAGING/static" -type f -mtime "+${STALE_STATIC_DAYS}" -delete 2>/dev/null || true
fi

# ── 3. Swap atómico ──────────────────────────────────────────────────────────
log "Swap: deteniendo ${SERVICE} (solo unos segundos)…"
sudo systemctl stop "$SERVICE"

rm -rf "$PREVIOUS"
if [[ -d "$CURRENT" ]]; then
  mv "$CURRENT" "$PREVIOUS"
fi
mv "$STAGING" "$CURRENT"

log "Iniciando ${SERVICE} con el build nuevo…"
sudo systemctl start "$SERVICE"

# ── 4. Health-check + rollback ───────────────────────────────────────────────
healthy=0
for _ in $(seq 1 30); do
  if curl -sf "$HEALTH_URL" >/dev/null 2>&1 || curl -sfI http://127.0.0.1:3000/ >/dev/null 2>&1; then
    healthy=1
    break
  fi
  sleep 1
done

if [[ "$healthy" -ne 1 ]]; then
  echo "ERROR: el build nuevo no respondió en 30 s — ROLLBACK al build anterior…" >&2
  sudo systemctl stop "$SERVICE" || true
  rm -rf "${CURRENT}.failed"
  mv "$CURRENT" "${CURRENT}.failed"
  if [[ -d "$PREVIOUS" ]]; then
    mv "$PREVIOUS" "$CURRENT"
  fi
  sudo systemctl start "$SERVICE"
  echo "Rollback completado. El build fallido quedó en ${CURRENT}.failed para inspección." >&2
  exit 1
fi

log "OK: ${SERVICE} responde con BUILD_ID $(cat "$CURRENT/BUILD_ID")."

# ── 5. Purga de caché Cloudflare (opcional) ──────────────────────────────────
# CF_ZONE_ID y CF_API_TOKEN ya están cargados desde ENV_FILE (paso 0).
# No releer el archivo aquí para evitar impresión accidental de secretos.
CF_ZONE_ID="${CF_ZONE_ID:-}"
CF_API_TOKEN="${CF_API_TOKEN:-}"

if should_purge_cloudflare_cache; then
  log "Purgando caché de Cloudflare (zona ${CF_ZONE_ID:0:6}…)…"
  purge_msg="$(cloudflare_purge_decision execute)"
  log "$purge_msg"
else
  log "$(cloudflare_purge_decision dry-run)"
fi

log "Deploy completado."
