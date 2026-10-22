#!/usr/bin/env bash
# Trigger one scheduled job on the local API: cron-job.sh virus-definitions | school-digest
# Reads the secret from backend/.env so it never appears in the crontab.
set -euo pipefail
ENV_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/backend/.env"
SECRET=$(grep -E '^WEBHOOK_CRON_SECRET=' "$ENV_FILE" | head -1 | cut -d= -f2- | sed 's/[[:space:]]*#.*$//')
echo "$(date -Is) $1: $(curl -fsS -X POST -H "Authorization: Bearer $SECRET" -H "X-Webhook-Id: $1-$(date +%F)" "http://127.0.0.1:8001/api/cron/$1")"
