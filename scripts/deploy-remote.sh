#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

echo "[deploy] Fetching latest code in $APP_DIR"
git fetch origin
git reset --hard origin/main

echo "[deploy] Installing dependencies"
npm ci

echo "[deploy] Prisma generate + db push"
npm run db:generate
npm run db:push

echo "[deploy] Building"
npm run build

echo "[deploy] Reloading systemd unit"
sudo -n /usr/bin/systemctl daemon-reload
if systemctl is-active --quiet book-easy-web; then
  sudo -n /usr/bin/systemctl restart book-easy-web
else
  sudo -n /usr/bin/systemctl start book-easy-web
  sudo -n /usr/bin/systemctl enable book-easy-web
fi

echo "[deploy] Done. Live at https://book.easy.mk"
