#!/usr/bin/env bash
# =============================================================================
# Student Account Tracker — WSL Production Upgrade
# Syncs code, rebuilds, and restarts PM2. Safe to run repeatedly.
# Usage (from PowerShell): wsl bash "/mnt/c/Scripts/student account/scripts/linux/upgrade-student-account.sh"
# =============================================================================
set -euo pipefail

APP_DIR="$HOME/student-account"
WIN_PROJECT="/mnt/c/Scripts/student account"

BOLD='\033[1m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
RESET='\033[0m'

step() { echo -e "\n${BOLD}${CYAN}[$1]${RESET} $2"; }
ok()   { echo -e "${GREEN}  ✓ $1${RESET}"; }

echo -e "${BOLD}=====================================================${RESET}"
echo -e "${BOLD}  Student Account Tracker — Deploying Update${RESET}"
echo -e "${BOLD}=====================================================${RESET}"

# ─── 1. Sync files ───────────────────────────────────────────────────────────
step "1/4" "Syncing files from Windows..."

rsync -a --delete \
  --exclude='node_modules/' \
  --exclude='.next/' \
  --exclude='.git/' \
  --exclude='.env' \
  --exclude='.env.*' \
  --no-perms \
  "$WIN_PROJECT/" "$APP_DIR/"
ok "Files synced"

# ─── 2. Install / update packages ────────────────────────────────────────────
step "2/4" "Installing packages and generating Prisma client..."

export NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt
cd "$APP_DIR"

npm install
ok "npm packages up to date"

npx prisma generate
ok "Prisma client generated"

# ─── 3. Apply any schema changes ─────────────────────────────────────────────
step "3/4" "Applying database migrations..."

npx prisma db push --accept-data-loss
ok "Schema up to date"

# ─── 4. Build and restart ─────────────────────────────────────────────────────
step "4/4" "Building and restarting..."

npm run build
ok "Production build complete"

# Restart if running, otherwise start fresh
if pm2 describe student-account &>/dev/null; then
  pm2 restart student-account
  ok "PM2 process restarted"
else
  pm2 start npm --name "student-account" -- start
  pm2 save
  ok "PM2 process started"
fi

echo ""
echo -e "${BOLD}=====================================================${RESET}"
echo -e "${GREEN}${BOLD}  Deploy complete!${RESET}"
echo -e "${BOLD}=====================================================${RESET}"
echo ""
echo -e "  URL: ${CYAN}http://localhost:3000${RESET}"
echo ""
