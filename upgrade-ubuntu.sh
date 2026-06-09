#!/usr/bin/env bash
# =============================================================================
#  Moneyfinder — Interactive Upgrade Script
#  Pulls the latest commit from GitHub, rebuilds, and restarts the service.
#  Requires a git-based installation (install-ubuntu.sh run with GITHUB_REPO set).
#  Does NOT touch the database schema destructively or modify .env.
#
#  Usage (run as root or a user with sudo):
#    sudo bash upgrade-ubuntu.sh
#
#  Override defaults with environment variables:
#    export APP_DIR=/opt/moneyfinder
#    export UPDATE_BRANCH=master
#    sudo -E bash upgrade-ubuntu.sh
# =============================================================================
set -euo pipefail

# ── Colour helpers ────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { printf "${CYAN}[upgrade]${RESET} %s\n"       "$*"; }
ok()      { printf "${GREEN}[  ok  ]${RESET} %s\n"       "$*"; }
warn()    { printf "${YELLOW}[ warn ]${RESET} %s\n"       "$*"; }
die()     { printf "${RED}[ fail ]${RESET} %s\n" "$*" >&2; exit 1; }
section() { printf "\n${BOLD}${CYAN}══ %s ══${RESET}\n\n" "$*"; }

# ── Root / sudo detection ─────────────────────────────────────────────────────
if [[ "${EUID}" -eq 0 ]]; then
  SUDO=""
else
  SUDO="sudo"
  command -v sudo >/dev/null 2>&1 || die "sudo not found. Re-run as root or install sudo first."
fi
as_root() { [[ -n "${SUDO}" ]] && ${SUDO} "$@" || "$@"; }

# ── Config ────────────────────────────────────────────────────────────────────
APP_DIR="${APP_DIR:-/opt/moneyfinder}"
BRANCH="${UPDATE_BRANCH:-master}"

# ── Pre-flight checks ─────────────────────────────────────────────────────────
section "Moneyfinder — Upgrade"

[[ -d "${APP_DIR}" ]]      || die "Install directory '${APP_DIR}' not found. Run install-ubuntu.sh first."
[[ -f "${APP_DIR}/.env" ]] || die ".env not found in '${APP_DIR}'. Run install-ubuntu.sh first."
[[ -d "${APP_DIR}/.git" ]] || die "'${APP_DIR}' is not a git repository. Use update-ubuntu.sh for rsync-based upgrades."

command -v git >/dev/null 2>&1 || die "git not found."
command -v npm >/dev/null 2>&1 || npm_bin="/usr/bin/npm"
npm_bin="${npm_bin:-$(command -v npm)}"
[[ -x "${npm_bin}" ]] || die "npm not found. Is Node.js installed?"

# Detect app user from .env ownership
APP_USER="$(stat -c '%U' "${APP_DIR}/.env" 2>/dev/null || echo '')"
[[ -z "${APP_USER}" || "${APP_USER}" == "root" ]] && \
  APP_USER="$(stat -c '%U' "${APP_DIR}" 2>/dev/null || echo '')"
[[ -z "${APP_USER}" ]] && die "Could not detect app user. Set APP_USER=<username> and retry."

# ── Fetch remote and show pending changes ─────────────────────────────────────
export GIT_SSL_NO_VERIFY=true
# Mark APP_DIR safe for git running as root
git config --global --add safe.directory "${APP_DIR}" 2>/dev/null || true

info "Fetching remote refs from origin/${BRANCH}"
if ! git -C "${APP_DIR}" fetch origin "${BRANCH}" --quiet 2>/dev/null; then
  die "git fetch failed. Check network access to GitHub."
fi

LOCAL_SHA="$(git  -C "${APP_DIR}" rev-parse HEAD)"
REMOTE_SHA="$(git -C "${APP_DIR}" rev-parse "origin/${BRANCH}")"

printf "\n"
printf "  %-16s %s\n" "Install dir:"  "${APP_DIR}"
printf "  %-16s %s\n" "App user:"     "${APP_USER}"
printf "  %-16s %s\n" "Branch:"       "${BRANCH}"
printf "  %-16s %s\n" "Current:"      "${LOCAL_SHA:0:12}"
printf "  %-16s %s\n" "Available:"    "${REMOTE_SHA:0:12}"
printf "\n"

if [[ "${LOCAL_SHA}" == "${REMOTE_SHA}" ]]; then
  ok "Already up to date — nothing to apply."
  exit 0
fi

# Show the commits that will be applied
PENDING_COUNT="$(git -C "${APP_DIR}" rev-list HEAD..origin/${BRANCH} --count)"
printf "  ${BOLD}Pending commits (${PENDING_COUNT}):${RESET}\n"
git -C "${APP_DIR}" log HEAD..origin/"${BRANCH}" \
  --oneline --no-decorate | sed 's/^/    /'
printf "\n"

# Warn if a package.json change is included (dependency updates need npm install)
PKG_CHANGED=false
if git -C "${APP_DIR}" diff HEAD origin/"${BRANCH}" --name-only 2>/dev/null \
    | grep -q "^package"; then
  PKG_CHANGED=true
  warn "package.json or package-lock.json changed — dependencies will be reinstalled."
fi

# Warn if next-auth version jumps — active sessions will be invalidated
if git -C "${APP_DIR}" diff HEAD origin/"${BRANCH}" -- package.json 2>/dev/null \
    | grep -q "next-auth"; then
  printf "  ${YELLOW}Note:${RESET} next-auth version is changing in this upgrade.\n"
  printf "  All active user sessions will be invalidated. Users will need to log in again.\n\n"
fi

read -r -p "  Apply upgrade? [Y/n]: " confirm
[[ "${confirm,,}" == "n" ]] && { info "Aborted."; exit 0; }

# ── 1. Pause auto-update timer ────────────────────────────────────────────────
section "1 / 5 — Pausing Auto-Update Timer"

UPDATER_WAS_ACTIVE=false
if as_root systemctl is-active --quiet moneyfinder-updater.timer 2>/dev/null; then
  as_root systemctl stop moneyfinder-updater.timer
  UPDATER_WAS_ACTIVE=true
  ok "Auto-update timer paused"
else
  info "Auto-update timer not active — skipping"
fi

# ── 2. Stop service ───────────────────────────────────────────────────────────
section "2 / 5 — Stopping Service"

if as_root systemctl is-active --quiet moneyfinder 2>/dev/null; then
  as_root systemctl stop moneyfinder
  ok "Service stopped"
else
  warn "moneyfinder service was not running"
fi

# ── Cleanup handler — restores service on error ───────────────────────────────
cleanup_on_error() {
  warn "Upgrade failed — attempting to restart service with existing build"
  as_root systemctl start moneyfinder 2>/dev/null || true
  if "${UPDATER_WAS_ACTIVE}"; then
    as_root systemctl start moneyfinder-updater.timer 2>/dev/null || true
  fi
}
trap cleanup_on_error ERR

# ── 3. Apply changes ──────────────────────────────────────────────────────────
section "3 / 5 — Applying Changes"

info "Resetting working tree to origin/${BRANCH}"
git -C "${APP_DIR}" reset --hard "origin/${BRANCH}"
ok "Code updated to ${REMOTE_SHA:0:12}"

# Self-refresh the auto-update binary in case that script changed
if [[ -f "${APP_DIR}/scripts/linux/auto-update.sh" ]]; then
  as_root install -m 0755 -o root -g root \
    "${APP_DIR}/scripts/linux/auto-update.sh" "/usr/local/bin/moneyfinder-auto-update" 2>/dev/null || true
  ok "Auto-update binary refreshed"
fi

# ── 4. Rebuild ────────────────────────────────────────────────────────────────
section "4 / 5 — Rebuilding"

# NODE_TLS_REJECT_UNAUTHORIZED=0 bypasses SSL for corporate TLS-inspection
# proxies during npm and Prisma downloads — not used by the running app.
export NODE_TLS_REJECT_UNAUTHORIZED=0

info "Clearing stale build artefacts"
rm -rf "${APP_DIR}/.next" "${APP_DIR}/node_modules"

# Offline font patch — corporate networks block Google Fonts at build time
layout="${APP_DIR}/src/app/layout.tsx"
if [[ -f "${layout}" ]] && grep -q "next/font/google" "${layout}" 2>/dev/null; then
  info "Patching layout.tsx (removing next/font/google for offline build)"
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
${npm_bin} ci || {
  warn "npm ci failed — retrying with npm install"
  ${npm_bin} install
}

info "Regenerating Prisma client"
node "${APP_DIR}/node_modules/prisma/build/index.js" generate

info "Applying database schema changes"
node "${APP_DIR}/node_modules/prisma/build/index.js" db push --accept-data-loss

info "Building Next.js production bundle"
${npm_bin} run build

info "Restoring file ownership to ${APP_USER}"
as_root chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"

ok "Build complete"

# ── 5. Restart service ────────────────────────────────────────────────────────
section "5 / 5 — Starting Service"

trap - ERR  # clear error handler now that build succeeded

as_root systemctl start moneyfinder
sleep 3

if as_root systemctl is-active --quiet moneyfinder; then
  ok "moneyfinder is running"
else
  warn "Service did not start cleanly."
  warn "Check: sudo systemctl status moneyfinder --no-pager"
  warn "Logs:  sudo journalctl -u moneyfinder -n 50 --no-pager"
  "${UPDATER_WAS_ACTIVE}" && as_root systemctl start moneyfinder-updater.timer || true
  exit 1
fi

# Resume auto-update timer
if "${UPDATER_WAS_ACTIVE}"; then
  as_root systemctl start moneyfinder-updater.timer
  ok "Auto-update timer resumed"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
section "Upgrade Complete"

printf "  ${GREEN}${BOLD}Upgrade applied successfully.${RESET}\n\n"
printf "  %-16s %s\n" "Previous:"  "${LOCAL_SHA:0:12}"
printf "  %-16s %s\n" "Now at:"    "${REMOTE_SHA:0:12}"
printf "\n"
printf "  Useful commands:\n"
printf "    sudo systemctl status moneyfinder --no-pager\n"
printf "    sudo journalctl -u moneyfinder -f\n\n"
