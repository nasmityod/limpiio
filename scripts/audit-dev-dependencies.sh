#!/usr/bin/env bash
# audit-dev-dependencies.sh
# Audita dependencias dev y genera artifact/documentación.
# No bloquea CI, solo reporta.
set -euo pipefail

OUTPUT_FILE="${1:-docs/DEV-DEPENDENCY-AUDIT.md}"

if [ ! -f node_modules/.package-lock.json ]; then
  echo "ERROR: node_modules no encontrado. Ejecuta npm ci primero."
  exit 1
fi

echo "# Auditoría de dependencias de desarrollo" > "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"
echo "Generado: $(date -u '+%Y-%m-%dT%H:%M:%SZ')" >> "$OUTPUT_FILE"
echo "Comando: npm audit --include=dev --audit-level=moderate" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# Ejecutar audit para dev dependencies
npm audit --include=dev --audit-level=moderate 2>&1 | tee -a "$OUTPUT_FILE" || true
echo "" >> "$OUTPUT_FILE"
echo "---" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

echo "OK: Artículo generado en $OUTPUT_FILE"
