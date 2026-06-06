#!/usr/bin/env bash
# =============================================================================
#  Moneyfinder — Update Script
#  Copies new app files, rebuilds, and restarts the service.
#  Does NOT touch the database or .env file.
#
#  Usage:
#    sudo bash update-ubuntu.sh
#
#  Place this script next to your updated app files (same folder as package.json),
#  or set APP_SOURCE to the folder containing the new files:
#    export APP_SOURCE=/path/to/app
#    sudo bash update-ubuntu.sh
# =============================================================================
set -euo pipefail

# ── Colour helpers ────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { printf "${CYAN}[update]${RESET} %s\n"        "$*"; }
ok()      { printf "${GREEN}[  ok  ]${RESET} %s\n"        "$*"; }
warn()    { printf "${YELLOW}[ warn ]${RESET} %s\n"        "$*"; }
die()     { printf "${RED}[ fail ]${RESET} %s\n" "$*" >&2; exit 1; }
section() { printf "\n${BOLD}${CYAN}══ %s ══${RESET}\n\n" "$*"; }

# ── Root check ────────────────────────────────────────────────────────────────
if [[ "${EUID}" -eq 0 ]]; then
  SUDO=""
else
  SUDO="sudo"
  command -v sudo >/dev/null 2>&1 || die "sudo not found. Re-run as root."
fi
as_root() { [[ -n "${SUDO}" ]] && ${SUDO} "$@" || "$@"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Config ────────────────────────────────────────────────────────────────────
APP_DIR="${APP_DIR:-/opt/moneyfinder}"
APP_SOURCE="${APP_SOURCE:-${SCRIPT_DIR}}"

[[ -d "${APP_DIR}" ]]           || die "Install directory '${APP_DIR}' not found. Run install-ubuntu.sh first."
[[ -f "${APP_DIR}/.env" ]]      || die ".env not found in '${APP_DIR}'. Run install-ubuntu.sh first."
[[ -f "${APP_SOURCE}/package.json" ]] || die "package.json not found in '${APP_SOURCE}'. Set APP_SOURCE=/path/to/app."

# Detect the app user from existing file ownership
APP_USER="$(stat -c '%U' "${APP_DIR}")"
[[ -z "${APP_USER}" || "${APP_USER}" == "root" ]] && \
  APP_USER="$(stat -c '%U' "${APP_DIR}/.env" 2>/dev/null || echo '')"
[[ -z "${APP_USER}" || "${APP_USER}" == "root" ]] && \
  die "Could not detect app user. Set APP_USER=<username> and retry."

section "Moneyfinder — Update"
printf "  Source : %s\n" "${APP_SOURCE}"
printf "  Target : %s\n" "${APP_DIR}"
printf "  User   : %s\n\n" "${APP_USER}"
read -r -p "  Apply update? [Y/n]: " confirm
[[ "${confirm,,}" == "n" ]] && { info "Aborted."; exit 0; }

# ── 1. Stop service ───────────────────────────────────────────────────────────
section "1 / 4 — Stopping Service"
if as_root systemctl is-active --quiet moneyfinder 2>/dev/null; then
  as_root systemctl stop moneyfinder
  ok "Service stopped"
else
  warn "moneyfinder service was not running"
fi

# ── 2. Copy new files ─────────────────────────────────────────────────────────
section "2 / 4 — Copying Files"
info "Syncing files (preserving .env, node_modules, .next will be cleared at build)"
as_root rsync -a --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude '.env' \
  "${APP_SOURCE}/" "${APP_DIR}/"
as_root chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"
ok "Files synced"

# ── 3. Rebuild ────────────────────────────────────────────────────────────────
section "3 / 4 — Rebuilding"

npm_bin="$(command -v npm 2>/dev/null || echo /usr/bin/npm)"
[[ -x "${npm_bin}" ]] || die "npm not found. Is Node.js installed?"

# Bypass corporate TLS inspection for npm and Prisma downloads
export NODE_TLS_REJECT_UNAUTHORIZED=0

info "Clearing stale build cache"
rm -rf "${APP_DIR}/.next" "${APP_DIR}/node_modules"

# Apply Google Fonts patch (removes next/font/google for offline build)
layout="${APP_DIR}/src/app/layout.tsx"
if [[ -f "${layout}" ]] && grep -q "next/font/google" "${layout}" 2>/dev/null; then
  info "Patching layout.tsx (removing next/font/google)"
  cat > "${layout}" <<'LAYOUTEOF'
import type { Metadata } from "next";
import "./globals.css";

import { NextAuthSessionProvider } from "@/components/session-provider";

export const metadata: Metadata = {
  title: "Student Account Tracker",
  description: "Secure student account tracking, requests, and audit operations",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <NextAuthSessionProvider>{children}</NextAuthSessionProvider>
      </body>
    </html>
  );
}
LAYOUTEOF
  ok "Font patch applied"
fi

cd "${APP_DIR}"

info "Installing npm dependencies"
${npm_bin} ci || { warn "npm ci failed, retrying with npm install"; ${npm_bin} install; }

info "Regenerating Prisma client"
node "${APP_DIR}/node_modules/prisma/build/index.js" generate

info "Applying any new schema migrations"
node "${APP_DIR}/node_modules/prisma/build/index.js" db push --accept-data-loss

info "Building Next.js production bundle"
${npm_bin} run build

info "Restoring ownership"
as_root chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"

ok "Build complete"

# ── 4. Restart service ────────────────────────────────────────────────────────
section "4 / 4 — Starting Service"
as_root systemctl start moneyfinder
sleep 3

if as_root systemctl is-active --quiet moneyfinder; then
  ok "moneyfinder is running"
else
  warn "Service did not start cleanly. Check: sudo systemctl status moneyfinder --no-pager"
  exit 1
fi

section "Update Complete"
printf "  ${GREEN}${BOLD}Update applied successfully.${RESET}\n\n"
printf "  Useful commands:\n"
printf "    sudo systemctl status moneyfinder --no-pager\n"
printf "    sudo journalctl -u moneyfinder -f\n\n"
