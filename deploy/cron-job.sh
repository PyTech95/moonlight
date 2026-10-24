#!/usr/bin/env bash
# Trigger one scheduled job on the local API: cron-job.sh virus-definitions | school-digest | daily-care
# Reads the secret from backend/.env so it never appears in the crontab.
set -euo pipefail
ENV_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/backend/.env"
value() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- | sed 's/[[:space:]]*#.*$//'; }
SECRET=$(value WEBHOOK_CRON_SECRET)
# CRON_API_URL in backend/.env when the API listens somewhere other than 127.0.0.1:8001 (e.g. a shared server).
API=$(value CRON_API_URL); API=${API:-http://127.0.0.1:8001}
echo "$(date -Is) $1: $(curl -fsS -X POST -H "Authorization: Bearer $SECRET" -H "X-Webhook-Id: $1-$(date +%F)" "$API/api/cron/$1")"
