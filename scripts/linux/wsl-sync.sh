#!/usr/bin/env bash
# =============================================================================
# Sync updated project files from Windows to WSL and restart dev server
# Run inside WSL: bash /mnt/c/Scripts/student\ account/scripts/linux/wsl-sync.sh
# =============================================================================
set -euo pipefail

APP_DIR="$HOME/student-account"
WIN_PROJECT="/mnt/c/Scripts/student account"

echo "[sync] Syncing project files..."
rsync -a --delete \
  --exclude='node_modules/' \
  --exclude='.next/' \
  --exclude='.git/' \
  --exclude='.env' \
  --exclude='.env.*' \
  --no-perms \
  "$WIN_PROJECT/" "$APP_DIR/"
echo "[sync] Done — run 'npm run dev' in ~/student-account to start/restart."
