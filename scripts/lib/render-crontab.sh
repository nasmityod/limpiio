#!/usr/bin/env bash
# Pure rendering helper: retains other instances/jobs and scopes env per command.
set -euo pipefail
existing="$1"; template="$2"; instance="$3"; env_path="$4"
[[ "$instance" =~ ^[a-zA-Z0-9_-]+$ && "$env_path" =~ ^/[a-zA-Z0-9_./-]+$ ]] || exit 2
awk -v slug="$instance" '
  $0 == "# BEGIN STOREFRONT MANAGED CRON " slug { managed=1; next }
  $0 == "# END STOREFRONT MANAGED CRON " slug { managed=0; next }
  /^APP_SLUG=/ { active=$0; sub(/^APP_SLUG=/,"",active); gsub(/["\047]/,"",active) }
  {
    ownpath=index($0,"/var/www/" slug "/scripts/") || (active==slug && index($0,"/var/www/$APP_SLUG/scripts/"))
    owned=ownpath && ($0 ~ /run-bcv-cron\.sh/ || $0 ~ /backup-postgres\.sh/ || $0 ~ /run-cron-endpoint\.sh (abandoned-cart|purge-product-views|review-request|purge-temporary-data|purge-payment-uploads|auto-cancel-orders|cashea-reconcile|email-delivery|purge-orphan-uploads)([ \t]|$)/)
    if (!managed && !owned) print
  }
' "$existing"
printf '\n# BEGIN STOREFRONT MANAGED CRON %s\n' "$instance"
awk -v slug="$instance" -v envfile="$env_path" '
  /^APP_SLUG=/ { next }
  /^[ \t]*#/ || /^[ \t]*$/ { print; next }
  {
    schedule=$1 " " $2 " " $3 " " $4 " " $5
    command=$0
    for (i=1;i<=5;i++) sub(/^[^ \t]+[ \t]+/,"",command)
    gsub(/\$APP_SLUG/,slug,command)
    print schedule " APP_SLUG=" slug " APP_ENV_FILE=" envfile " " command
  }
' "$template"
printf '\n# END STOREFRONT MANAGED CRON %s\n' "$instance"
