#!/usr/bin/env bash
# =============================================================================
#  Moneyfinder — Automatic Update Service
#
#  Run by the moneyfinder-updater systemd timer (every 15 minutes).
#  Fetches the configured git remote, compares commits, and rebuilds the app
#  only when a new commit is detected. All output is appended to the log file.
#
#  Environment (override via systemd EnvironmentFile or export before running):
#    APP_DIR        — install directory          (default: /opt/moneyfinder)
#    UPDATE_BRANCH  — branch to track            (default: master)
#
#  Manual run (as root):
#    sudo /usr/local/bin/moneyfinder-auto-update
# =============================================================================
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/moneyfinder}"
BRANCH="${UPDATE_BRANCH:-master}"
LOG_DIR="/var/log/moneyfinder"
LOG_FILE="${LOG_DIR}/auto-update.log"
MAX_LOG_BYTES=5242880   # rotate at 5 MB

# ── Log rotation ──────────────────────────────────────────────────────────────
mkdir -p "${LOG_DIR}"
if [[ -f "${LOG_FILE}" ]] && \
   [[ "$(stat -c%s "${LOG_FILE}" 2>/dev/null || echo 0)" -gt "${MAX_LOG_BYTES}" ]]; then
  mv "${LOG_FILE}" "${LOG_FILE}.1"
fi

# ── Logging helpers ───────────────────────────────────────────────────────────
ts()  { date '+%Y-%m-%d %H:%M:%S'; }
log() { printf '[%s]  %s\n' "$(ts)" "$*" | tee -a "${LOG_FILE}"; }
err() { printf '[%s] ERROR: %s\n' "$(ts)" "$*" | tee -a "${LOG_FILE}" >&2; }

log "────────────────────────────────────────"
log "Auto-update check  branch=${BRANCH}"

# ── Sanity checks ─────────────────────────────────────────────────────────────
if [[ ! -d "${APP_DIR}" ]]; then
  log "APP_DIR '${APP_DIR}' not found — skipping."
  exit 0
fi

if [[ ! -d "${APP_DIR}/.git" ]]; then
  log "APP_DIR is not a git repository — skipping."
  log "  To enable auto-updates, reinstall with GITHUB_REPO set."
  exit 0
fi

command -v git >/dev/null || { err "git not found."; exit 1; }
command -v npm >/dev/null || { err "npm not found."; exit 1; }

# ── Fetch remote refs (network-only, no working tree change yet) ─────────────
# GIT_SSL_NO_VERIFY bypasses TLS inspection on corporate proxies for git operations.
export GIT_SSL_NO_VERIFY=true
# Git 2.35+ blocks operations on directories owned by a different user.
# The updater runs as root but the app dir is owned by the app user — mark it safe.
git config --global --add safe.directory "${APP_DIR}" 2>/dev/null || true
log "Fetching remote refs"
if ! git -C "${APP_DIR}" fetch origin "${BRANCH}" --quiet 2>>"${LOG_FILE}"; then
  log "git fetch failed (network issue or rate limit) — skipping this cycle."
  exit 0
fi

LOCAL_SHA="$(git -C "${APP_DIR}" rev-parse HEAD)"
REMOTE_SHA="$(git -C "${APP_DIR}" rev-parse "origin/${BRANCH}")"

log "Local : ${LOCAL_SHA:0:12}  Remote: ${REMOTE_SHA:0:12}"

if [[ "${LOCAL_SHA}" == "${REMOTE_SHA}" ]]; then
  log "Already up to date."
  exit 0
fi

log "New commit detected — beginning update"

# ── Detect app user from .env file ownership ──────────────────────────────────
APP_USER="$(stat -c '%U' "${APP_DIR}/.env" 2>/dev/null || echo '')"
[[ -z "${APP_USER}" || "${APP_USER}" == "root" ]] && \
  APP_USER="$(stat -c '%U' "${APP_DIR}" 2>/dev/null || echo 'nobody')"
log "App user: ${APP_USER}"

# ── Stop service ──────────────────────────────────────────────────────────────
log "Stopping moneyfinder service"
systemctl stop moneyfinder 2>>"${LOG_FILE}" || log "  (service was not running)"

# ── Apply changes ─────────────────────────────────────────────────────────────
log "Applying changes: git reset --hard origin/${BRANCH}"
git -C "${APP_DIR}" reset --hard "origin/${BRANCH}" >>"${LOG_FILE}" 2>&1

# ── Self-update ───────────────────────────────────────────────────────────────
# Replace the installed binary with the version just pulled from git so fixes
# to this script take effect on the next run without manual intervention.
SELF="/usr/local/bin/moneyfinder-auto-update"
if [[ -f "${APP_DIR}/scripts/linux/auto-update.sh" ]]; then
  install -m 0755 -o root -g root "${APP_DIR}/scripts/linux/auto-update.sh" "${SELF}"
  log "Auto-update script refreshed at ${SELF}"
fi

# ── Offline font patch ────────────────────────────────────────────────────────
# Corporate networks block Google Fonts at build time.
layout="${APP_DIR}/src/app/layout.tsx"
if [[ -f "${layout}" ]] && grep -q "next/font/google" "${layout}" 2>/dev/null; then
  log "Applying offline font patch to layout.tsx"
  cat > "${layout}" <<'LAYOUTEOF'
import type { Metadata } from "next";
import "./globals.css";
import { NextAuthSessionProvider } from "@/components/session-provider";

export const metadata: Metadata = {
  title: "WWT Student Account Tracker",
  description: "Secure student account tracking, requests, and audit operations",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <NextAuthSessionProvider>{children}</NextAuthSessionProvider>
      </body>
    </html>
  );
}
LAYOUTEOF
fi

# ── Rebuild ───────────────────────────────────────────────────────────────────
# NODE_TLS_REJECT_UNAUTHORIZED=0 bypasses SSL for corporate TLS-inspection proxies
# during npm downloads and Prisma engine downloads — not used by the running app.
export NODE_TLS_REJECT_UNAUTHORIZED=0

log "Clearing stale build cache"
rm -rf "${APP_DIR}/.next" "${APP_DIR}/node_modules"

log "Installing npm dependencies"
npm ci --prefix "${APP_DIR}" >>"${LOG_FILE}" 2>&1 || {
  log "npm ci failed — retrying with npm install"
  npm install --prefix "${APP_DIR}" >>"${LOG_FILE}" 2>&1
}

log "Regenerating Prisma client"
node "${APP_DIR}/node_modules/prisma/build/index.js" generate >>"${LOG_FILE}" 2>&1

log "Applying database migrations"
node "${APP_DIR}/node_modules/prisma/build/index.js" db push --accept-data-loss >>"${LOG_FILE}" 2>&1

log "Building Next.js production bundle"
npm run build --prefix "${APP_DIR}" >>"${LOG_FILE}" 2>&1

log "Restoring file ownership to ${APP_USER}"
chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"

# ── Start service ─────────────────────────────────────────────────────────────
log "Starting moneyfinder service"
systemctl start moneyfinder 2>>"${LOG_FILE}"
sleep 5

if systemctl is-active --quiet moneyfinder; then
  log "Update complete. Now running: ${REMOTE_SHA:0:12}"
else
  err "Service did not come back up after update."
  err "  Check: sudo systemctl status moneyfinder --no-pager"
  err "  Logs:  sudo journalctl -u moneyfinder -n 50 --no-pager"
  exit 1
fi
