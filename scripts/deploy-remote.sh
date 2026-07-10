#!/usr/bin/env bash
set -euo pipefail

# One-time step before the first run of this script against production, now that the
# app has moved from `prisma db push` to tracked migrations (prisma/migrations/):
#
#   1. Back up the production database first (see scripts/backup-db.sh).
#   2. On the VPS, in $APP_DIR, with DATABASE_URL pointing at production:
#        npx prisma migrate resolve --applied 20260710174949_init
#      This tells Prisma "the schema in this migration is already live" without
#      re-running its SQL (the tables already exist from prior `db push` runs).
#   3. Then `npx prisma migrate deploy` will apply only the migrations that come after
#      the baseline (starting with 20260710175030_availability_block_no_overlap).
#
# After that one-time step, this script's `db:migrate:deploy` call below handles all
# future schema changes normally — no more manual steps.

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

echo "[deploy] Fetching latest code in $APP_DIR"
git fetch origin
git reset --hard origin/main

echo "[deploy] Installing dependencies"
npm ci

echo "[deploy] Lint + typecheck (fail fast before touching the DB or building)"
npm run lint
npm run typecheck

echo "[deploy] Prisma generate + migrate deploy"
npm run db:generate
npm run db:migrate:deploy

echo "[deploy] Building"
npm run build

# Deliberately not running `npm test` here: the test suite writes throwaway fixture
# rows against whatever DATABASE_URL is active, which during a real deploy is
# production. Run tests locally / in CI against a non-production database before
# merging, not as part of this script.

echo "[deploy] Reloading systemd unit"
sudo -n /usr/bin/systemctl daemon-reload
if systemctl is-active --quiet book-easy-web; then
  sudo -n /usr/bin/systemctl restart book-easy-web
else
  sudo -n /usr/bin/systemctl start book-easy-web
  sudo -n /usr/bin/systemctl enable book-easy-web
fi

echo "[deploy] Done. Live at https://book.easy.mk"
