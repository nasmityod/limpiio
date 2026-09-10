#!/usr/bin/env bash
# Decisión de purga Cloudflare — extraída para tests sin deploy real.

should_purge_cloudflare_cache() {
  [[ -n "${CF_ZONE_ID:-}" && -n "${CF_API_TOKEN:-}" ]]
}

# mode: execute (default) | dry-run
# Imprime mensaje de decisión; exit 0 siempre salvo error interno.
cloudflare_purge_decision() {
  local mode="${1:-execute}"

  if should_purge_cloudflare_cache; then
    if [[ "$mode" == "dry-run" ]]; then
      echo "Cloudflare: purga ejecutada (dry-run)."
      return 0
    fi
    local purge_result
    purge_result=$(curl -sS -X POST \
      "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/purge_cache" \
      -H "Authorization: Bearer ${CF_API_TOKEN}" \
      -H "Content-Type: application/json" \
      --data '{"purge_everything":true}' || true)
    if echo "$purge_result" | grep -q '"success":true'; then
      echo "Cloudflare: caché purgada."
    else
      echo "AVISO: la purga de Cloudflare falló (no bloquea el deploy): $purge_result" >&2
    fi
    return 0
  fi

  echo "Cloudflare: sin CF_ZONE_ID/CF_API_TOKEN — purga omitida (opcional)."
  return 0
}
