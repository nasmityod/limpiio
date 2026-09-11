#!/usr/bin/env bash
# Grep de control del desmarcado. Excluye artefactos generados y Clase D.
#
# Uso: bash grep-control.sh [count|files|list|split|token <regex>]
#
# PATRÓN PRINCIPAL: -E -i 'mundo[ _.-]?tech'
#   El patrón original ('mundotech' literal) no casaba tres formas que aparecieron
#   de verdad en este repo: «Mundo Tech» (espacio), «Mundo-Tech-…» (guion, en el
#   enlace de Facebook) y la marca partida en dos elementos (ver modo `split`).
#   El separador es OPCIONAL y de UN solo carácter; las dos mitades siguen siendo
#   obligatorias y contiguas. No ampliarlo más: «mundo» a secas es una palabra
#   común en español y empezaría a casar texto legítimo de la tienda.
# Vive en docs/desmarcado/: la raíz del repo está dos niveles arriba.
cd "$(dirname "$0")/../.." || exit 1
PAT='mundo[ _.-]?tech'
# `desmarcado` excluye docs/desmarcado/: es el registro histórico del desmarcado y
# contiene la marca por definición (este script incluido). `.cleanup` es el
# directorio de trabajo original, ignorado por git, donde quedan los artefactos.
EX=(--exclude-dir=node_modules --exclude-dir=.next --exclude-dir='.next-*' --exclude-dir=.git
    --exclude-dir=desmarcado --exclude-dir=.cleanup --exclude-dir=playwright-report --exclude-dir=test-results
    --exclude-dir=coverage --exclude=package-lock.json --exclude=actionlint
    --exclude=mundotech-main.zip --exclude='*.tsbuildinfo')
# Archivos que renderizan marcado (modo `split`): componentes, SVG, HTML y el
# script .mjs que genera el SVG de public/og-default.png. Las plantillas de correo
# son .tsx (emails/transactional/), así que ya quedan dentro.
# Van ANTES de EX: en GNU grep, si la primera opción --include/--exclude es un
# --exclude, los archivos que no casan ninguna se incluyen igualmente.
RENDER=(--include='*.tsx' --include='*.jsx' --include='*.svg' --include='*.html' --include='*.mjs')
case "${1:-count}" in
  count) grep -ro -E -i "$PAT" . "${EX[@]}" 2>/dev/null | wc -l ;;
  files) grep -rl -E -i "$PAT" . "${EX[@]}" 2>/dev/null | sort ;;
  list)  grep -rn -E -i "$PAT" . "${EX[@]}" 2>/dev/null ;;
  # split: la marca partida en dos elementos (<span>Mundo</span><span>Tech</span>,
  # <tspan>Mundo</tspan>…) no cabe en ningún grep de línea. Este modo busca la
  # primera mitad como palabra suelta (-w) en archivos de render.
  # ⚠️ GENERA FALSOS POSITIVOS: es para REVISIÓN MANUAL. No forma parte del
  # criterio de aceptación automático, que sigue siendo `count` = 0.
  split) grep -rn -i -w "mundo" . "${RENDER[@]}" "${EX[@]}" 2>/dev/null ;;
  token) grep -ro -E "$2" . "${EX[@]}" 2>/dev/null | wc -l ;;
  *) echo "uso: $0 [count|files|list|split|token <regex>]" >&2; exit 2 ;;
esac
