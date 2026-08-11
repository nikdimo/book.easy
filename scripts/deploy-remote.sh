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
export PRISMA_HIDE_UPDATE_MESSAGE=1
BUILD_DIR=".next-build"
PREVIOUS_BUILD_DIR=".next-previous"

# FAST_DEPLOY=1 is set by Control Panel option 8, for quick production tests.
#
# Its contract is that a later full release (option 5) restores production to exactly
# the state it would have been in had the fast deploy never run. That holds because
# fast mode only ever skips work that option 5 redoes from scratch — the dependency
# audit, lint, the i18n and amenity catalog sync, and a redundant `npm ci` — and
# because it makes no irreversible change: it never migrates the database (see the
# refusal check below) and never writes to production's translation or amenity data.
#
# Everything that protects the running service still runs every time: the full
# production build, the build-output check, atomic promotion, restart, the public
# health check, and rollback to the previous build on failure.
#
# The one residue fast mode leaves is source files that are tracked locally but not
# yet in origin/main. The control panel's full-deploy path clears those with
# `git clean -fd` after resetting to origin/main.
FAST_DEPLOY="${FAST_DEPLOY:-0}"
LOCKFILE_STAMP="node_modules/.deploy-lockfile-hash"

if [ "$FAST_DEPLOY" = "1" ]; then
  echo "[deploy] FAST mode: no database change; audit, lint, and catalog sync skipped"
fi

if [ "${SKIP_GIT_REFRESH:-0}" = "1" ]; then
  echo "[deploy] Using the commit already refreshed by the control panel"
else
  echo "[deploy] Fetching latest code in $APP_DIR"
  git fetch origin
  git reset --hard origin/main
fi

# Use the reviewed lockfile exactly. The repository's .npmrc carries the temporary
# Auth.js/Nodemailer peer-range compatibility setting used by local and CI installs.
LOCKFILE_HASH="$(sha256sum package-lock.json .npmrc 2>/dev/null | sha256sum | cut -d' ' -f1)"
if [ "$FAST_DEPLOY" = "1" ] \
  && [ -d node_modules ] \
  && [ -f "$LOCKFILE_STAMP" ] \
  && [ "$(cat "$LOCKFILE_STAMP")" = "$LOCKFILE_HASH" ]; then
  echo "[deploy] Dependencies unchanged since the last install; skipping npm ci"
else
  echo "[deploy] Installing dependencies"
  npm ci
  printf '%s' "$LOCKFILE_HASH" > "$LOCKFILE_STAMP"
fi

if [ "$FAST_DEPLOY" = "1" ]; then
  echo "[deploy] Skipping the production dependency audit"
else
  echo "[deploy] Auditing production dependencies"
  npm audit --omit=dev --audit-level=high
fi

echo "[deploy] Generating Prisma client before typecheck"
# Source can reference new schema models/fields (e.g. after a migration adds a
# table) before the locally-generated Prisma Client on this machine knows about
# them. `tsc --noEmit` below only checks against whatever client was last
# generated, so this must run first or typecheck fails on legitimate, current
# source code with "property does not exist" errors that have nothing to do
# with an actual bug.
npm run db:generate

if [ "$FAST_DEPLOY" = "1" ]; then
  # Fast deploy must be perfectly undoable by a later full release (option 5), and an
  # applied migration is the one thing a later deploy cannot undo. So fast mode never
  # migrates: if the schema would change, it refuses instead. This check sits after
  # db:generate (which needs node_modules and the migrations directory anyway) and
  # before the build, so a refusal costs nothing and leaves the live service, its
  # build output, and the database completely untouched.
  #
  # `prisma migrate status` exits non-zero for pending migrations AND for schema
  # drift, so either condition correctly blocks the fast path.
  echo "[deploy] Verifying that this deploy needs no database change"
  if ! npx prisma migrate status; then
    echo "" >&2
    echo "[deploy] REFUSED: this change needs a database migration, or production has drifted." >&2
    echo "[deploy] Fast deploy never migrates, because a later full release cannot undo one." >&2
    echo "[deploy] Nothing was built, migrated, or restarted. Production is unchanged." >&2
    echo "[deploy] Use Control Panel option 5 (full release) for this change." >&2
    exit 1
  fi
  echo "[deploy] Database schema is already current; no migration will run"
fi

echo "[deploy] Clearing stale staging output before typecheck"
# tsconfig.json's `include` covers .next/types/**/*.ts — Next.js-generated shims that
# type-check each route handler. Those shims are only regenerated by an actual
# `next build`/`next dev` run. A standalone `tsc --noEmit` (below) never touches them,
# so if .next/ is left over from a build that predates a route file being renamed or
# deleted, typecheck can fail on a stale reference to a module that's gone from source.
# Build into a separate directory so a failed deploy never removes the artifacts used
# by the running service. The completed directory is promoted immediately before the
# restart near the end of this script.
rm -rf "$BUILD_DIR"

if [ "$FAST_DEPLOY" = "1" ]; then
  # The build's own prebuild hook regenerates the catalog, so the extract here is only
  # needed to feed the i18n import/sync steps that fast mode skips anyway.
  echo "[deploy] Skipping the standalone catalog refresh and lint"
else
  echo "[deploy] Refreshing the UI catalog before validation"
  # Regenerate on the target platform so i18n:check validates the current checkout
  # rather than relying on a platform-specific generated artifact from the release
  # machine (Windows and Linux can differ in path/line-ending normalization).
  npm run i18n:extract

  echo "[deploy] Linting before the production build"
  npm run lint
fi

echo "[deploy] Building"
# Next's production build performs its own TypeScript pass on Linux. The control panel
# already ran standalone web/mobile typechecks locally, so another standalone tsc here
# only duplicated work without adding a distinct check.
NEXT_BUILD_DIR="$BUILD_DIR" npm run build

for required_build_path in \
  "$BUILD_DIR/BUILD_ID" \
  "$BUILD_DIR/prerender-manifest.json" \
  "$BUILD_DIR/server/app-paths-manifest.json" \
  "$BUILD_DIR/static"; do
  if [ ! -e "$required_build_path" ]; then
    echo "[deploy] ERROR: completed build is missing $required_build_path" >&2
    exit 1
  fi
done

if [ "$FAST_DEPLOY" = "1" ]; then
  # Guaranteed by the refusal check above: there is nothing to migrate, so there is no
  # schema change to make recoverable and no reason to spend a full pg_dump here.
  echo "[deploy] No database change in fast mode; skipping the backup and migration"
else
  echo "[deploy] Backing up the production database before migrations"
  # Deployment runs as the app user, so keep release backups in a sibling directory it
  # owns rather than assuming it can create /var/backups/book-easy. The scheduled backup
  # service may continue using BACKUP_DIR=/var/backups/book-easy independently.
  DEPLOY_BACKUP_DIR="${DEPLOY_BACKUP_DIR:-$(dirname "$APP_DIR")/book-easy-backups}"
  BACKUP_DIR="$DEPLOY_BACKUP_DIR" bash "$APP_DIR/scripts/backup-db.sh"

  echo "[deploy] Prisma migrate deploy"
  npm run db:migrate:deploy
fi

if [ "$FAST_DEPLOY" = "1" ]; then
  # These three sync content catalogs, not code. Option 5 (full release) is what
  # regenerates and validates them, so a code-only fast deploy leaves production's
  # current amenity and translation data exactly as it is.
  echo "[deploy] Skipping amenity import and translation import/sync"
else
  echo "[deploy] Adding amenities that are missing from production"
  # The release snapshot is exported from the local database by Control Panel option 5.
  # Import is additive by amenity name: production-only rows and all existing production
  # settings remain untouched.
  npm run amenities:import

  echo "[deploy] Importing reviewed AI translations"
  # This imports only the version-controlled fixed-UI translation snapshot. It preserves
  # current production manual overrides, touches no user/listing/booking data, validates
  # the snapshot against the exact built catalog, and exits non-zero before restart if
  # completeness verification fails.
  npm run i18n:import-reviewed

  echo "[deploy] Syncing new and changed UI translations"
  # The build's prebuild hook regenerates the AST-validated catalog. Sync after a
  # successful build so new UI copy is translated before the new process is restarted.
  npm run i18n:sync
fi

# Deliberately not running `npm test` here: the test suite writes throwaway fixture
# rows against whatever DATABASE_URL is active, which during a real deploy is
# production. Run tests locally / in CI against a non-production database before
# merging, not as part of this script.

echo "[deploy] Promoting the completed build"
rm -rf "$PREVIOUS_BUILD_DIR"
if [ -d .next ]; then
  mv .next "$PREVIOUS_BUILD_DIR"
fi
if ! mv "$BUILD_DIR" .next; then
  if [ -d "$PREVIOUS_BUILD_DIR" ]; then
    mv "$PREVIOUS_BUILD_DIR" .next
  fi
  echo "[deploy] ERROR: could not promote the completed build" >&2
  exit 1
fi

echo "[deploy] Reloading systemd unit"
sudo -n /usr/bin/systemctl daemon-reload
if systemctl is-active --quiet book-easy-web; then
  sudo -n /usr/bin/systemctl restart book-easy-web
else
  sudo -n /usr/bin/systemctl start book-easy-web
  sudo -n /usr/bin/systemctl enable book-easy-web
fi

echo "[deploy] Waiting for the public health check"
HEALTH_URL="${DEPLOY_HEALTH_URL:-https://lingerhomes.com/api/mobile/v1/languages?locale=en}"
PAGE_HEALTH_URL="${DEPLOY_PAGE_HEALTH_URL:-https://lingerhomes.com/login}"
HEALTHY=0
for attempt in $(seq 1 12); do
  if curl --fail --silent --max-time 3 "$HEALTH_URL" >/dev/null \
    && curl --fail --silent --max-time 5 "$PAGE_HEALTH_URL" >/dev/null; then
    HEALTHY=1
    echo "[deploy] Health check passed on attempt $attempt"
    break
  fi
  echo "[deploy] Health check attempt $attempt of 12 failed; retrying..."
  sleep 2
done

if [ "$HEALTHY" -ne 1 ]; then
  echo "[deploy] ERROR: service restart completed but an API or rendered-page health check failed" >&2
  sudo -n /usr/bin/systemctl --no-pager --full status book-easy-web || true

  if [ -d "$PREVIOUS_BUILD_DIR" ]; then
    echo "[deploy] Rolling back to the previous build"
    sudo -n /usr/bin/systemctl stop book-easy-web || true
    rm -rf .next
    mv "$PREVIOUS_BUILD_DIR" .next
    sudo -n /usr/bin/systemctl start book-easy-web
  fi
  exit 1
fi

rm -rf "$PREVIOUS_BUILD_DIR"

# Leave a breadcrumb so a later deploy can report that the working tree it just reset
# was carrying uncommitted fast-deploy files. The marker is untracked and not ignored,
# so the `git clean -fd` in the control panel's full-deploy path removes it along with
# the rest of the fast-deploy residue.
if [ "$FAST_DEPLOY" = "1" ]; then
  date -u '+%Y-%m-%dT%H:%M:%SZ' > .fast-deploy-state
  echo "[deploy] Done. Fast deploy live at https://lingerhomes.com (no GitHub version, no database change)"
else
  rm -f .fast-deploy-state
  echo "[deploy] Done. Live and healthy at https://lingerhomes.com"
fi
