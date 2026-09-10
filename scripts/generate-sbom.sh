#!/usr/bin/env bash
# generate-sbom.sh
# Genera SBOM CycloneDX para mundotech-ecommerce.
# Uso: bash scripts/generate-sbom.sh [output-dir]
set -euo pipefail

OUTPUT_DIR="${1:-sbom}"
mkdir -p "$OUTPUT_DIR"

SBOM_FILE="$OUTPUT_DIR/cyclonedx-sbom.json"

npx --no-install cyclonedx-npm \
  --output-file "$SBOM_FILE" \
  --spec-version 1.6 \
  --short-PURLs \
  --flatten-components \
  --ignore-npm-errors \
  package.json

echo "OK: SBOM generado en $SBOM_FILE"
wc -c < "$SBOM_FILE" | xargs -I{} echo "Tamaño: {} bytes"
