#!/usr/bin/env bash
set -euo pipefail

# Nightly backup for the production Postgres database. Not installed/scheduled by
# itself — install the systemd timer that calls this script:
#
#   sudo cp scripts/systemd/book-easy-backup.service scripts/systemd/book-easy-backup.timer /etc/systemd/system/
#   sudo systemctl daemon-reload
#   sudo systemctl enable --now book-easy-backup.timer
#
# Adjust WorkingDirectory in book-easy-backup.service to match the real deploy path
# on the VPS first (scripts/deploy-remote.sh resolves it dynamically at deploy time,
# but a systemd unit needs a fixed path).
#
# Requires `pg_dump` on PATH, matching (or newer than) the server's PostgreSQL major
# version — e.g. `sudo apt install postgresql-client-16`.

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

# shellcheck disable=SC1091
set -a
source "$APP_DIR/.env"
set +a

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[backup] DATABASE_URL is not set (check .env)" >&2
  exit 1
fi

# pg_dump's libpq URI parser rejects Prisma's `?schema=public` query parameter
# ("invalid URI query parameter"), so strip any query string before use. The app only
# ever uses the default "public" schema, so no `-n` flag is needed.
DUMP_URL="${DATABASE_URL%%\?*}"

BACKUP_DIR="${BACKUP_DIR:-/var/backups/book-easy}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="$BACKUP_DIR/bookeasy-$TIMESTAMP.dump"

mkdir -p "$BACKUP_DIR"

echo "[backup] Dumping database to $DEST"
pg_dump "$DUMP_URL" -F c -f "$DEST"

echo "[backup] Pruning backups older than $RETENTION_DAYS days"
find "$BACKUP_DIR" -name 'bookeasy-*.dump' -mtime "+$RETENTION_DAYS" -delete

echo "[backup] Done: $(du -h "$DEST" | cut -f1) — $DEST"
echo "[backup] Restore with: pg_restore -d <target-db-url> --clean --if-exists $DEST"
