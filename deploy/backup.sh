#!/usr/bin/env bash
# Nightly backup: database dump (kept 14 days) and a copy of uploaded files (local storage only).
# Backups on the same server don't survive losing the server: also turn on your VPS provider's snapshots,
# or copy /var/backups/moonlight elsewhere (e.g. rclone to Google Drive / S3).
set -euo pipefail
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$APP_DIR/backend/.env"
DEST=/var/backups/moonlight
value() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- | sed 's/[[:space:]]*#.*$//'; }
mkdir -p "$DEST" && chmod 700 "$DEST"

if command -v mongodump >/dev/null; then
  mongodump --uri="$(value MONGO_URL)" --db="$(value DB_NAME)" --gzip --archive="$DEST/db-$(date +%F).archive.gz" --quiet
  find "$DEST" -name 'db-*.archive.gz' -mtime +14 -delete
  echo "$(date -Is) database backed up"
else
  echo "$(date -Is) mongodump not installed; skipping database (use Atlas backups when MongoDB is hosted there)"
fi

STORAGE=$(value STORAGE_DIR)
if [[ $(value STORAGE_BACKEND) == local && -d $STORAGE ]]; then
  rsync -a "$STORAGE"/ "$DEST/storage/"   # never deletes: files removed in the app stay in the backup
  echo "$(date -Is) uploaded files copied"
fi
