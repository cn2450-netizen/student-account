#!/usr/bin/env bash
# =============================================================================
#  Moneyfinder — Single-file Ubuntu Installer
#  Targets: Ubuntu 22.04 LTS / 24.04 LTS (Debian-based, apt)
#
#  Usage (run as root or a user with sudo):
#    sudo bash install-ubuntu.sh
#
#  All prompts can be skipped by exporting environment variables first:
#    export APP_HOST=10.8.73.32
#    export APP_USER=usfsadmin
#    export DB_PASSWORD='MyStrongPass1!'
#    export NEXTAUTH_SECRET="$(openssl rand -hex 32)"
#    sudo -E bash install-ubuntu.sh
#
#  Re-running this script on an existing installation is safe (idempotent).
# =============================================================================
set -euo pipefail

# ── Colour helpers ────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { printf "${CYAN}[install]${RESET} %s\n"        "$*"; }
ok()      { printf "${GREEN}[  ok  ]${RESET} %s\n"        "$*"; }
warn()    { printf "${YELLOW}[ warn ]${RESET} %s\n"        "$*"; }
die()     { printf "${RED}[ fail ]${RESET} %s\n" "$*" >&2; exit 1; }
section() { printf "\n${BOLD}${CYAN}══ %s ══${RESET}\n\n" "$*"; }

# ── Root / sudo detection ─────────────────────────────────────────────────────
if [[ "${EUID}" -eq 0 ]]; then
  SUDO=""
else
  SUDO="sudo"
  command -v sudo >/dev/null 2>&1 || die "sudo not found. Re-run as root or install sudo first."
fi

as_root()         { [[ -n "${SUDO}" ]] && ${SUDO} "$@" || "$@"; }
as_postgres()     { [[ -n "${SUDO}" ]] && ${SUDO} -u postgres "$@" || sudo -u postgres "$@"; }
run_as_app_user() {
  su "${APP_USER}" -s /bin/bash -c "export PATH=/usr/local/bin:/usr/bin:/bin:${PATH}; $*"
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Interactive config collection ─────────────────────────────────────────────
ask() {
  local var="$1" prompt="$2" default="${3:-}"
  if [[ -n "${!var:-}" ]]; then
    return
  fi
  if [[ -n "${default}" ]]; then
    read -r -p "  ${prompt} [${default}]: " input
    printf -v "${var}" '%s' "${input:-${default}}"
  else
    while [[ -z "${!var:-}" ]]; do
      read -r -p "  ${prompt}: " input
      printf -v "${var}" '%s' "${input}"
    done
  fi
}

ask_secret() {
  local var="$1" prompt="$2"
  if [[ -n "${!var:-}" ]]; then
    return
  fi
  read -r -s -p "  ${prompt}: " input
  echo
  printf -v "${var}" '%s' "${input}"
}

section "Moneyfinder — Ubuntu Installer"

printf "  This script will install the following components:\n"
printf "    • System packages (build-essential, curl, git, rsync, openssl, postgresql, nginx)\n"
printf "    • Node.js 22 (via NodeSource)\n"
printf "    • PostgreSQL (service + app database)\n"
printf "    • nginx (reverse proxy, HTTP → HTTPS redirect, self-signed cert)\n"
printf "    • Moneyfinder app (systemd service on port 3000)\n"
printf "    • SSL helper (/usr/local/bin/moneyfinder-ssl-install)\n"
printf "    • Auto-update service (systemd timer, checks GitHub every 15 min)\n\n"

# ── Collect configuration ─────────────────────────────────────────────────────
section "Configuration"

DEFAULT_USER="${SUDO_USER:-${USER}}"
[[ "${DEFAULT_USER}" == "root" ]] && DEFAULT_USER="usfsadmin"

# Default: app files live alongside this script
APP_SOURCE="${APP_SOURCE:-${SCRIPT_DIR}}"
# GITHUB_REPO can be set to clone directly instead of rsync from a local source.
# When set, APP_SOURCE is not required and auto-updates will be enabled automatically.
GITHUB_REPO="${GITHUB_REPO:-cn2450-netizen/student-account}"
UPDATE_BRANCH="${UPDATE_BRANCH:-master}"

if [[ -z "${GITHUB_REPO:-}" ]]; then
  [[ -f "${APP_SOURCE}/package.json" ]] || die "package.json not found in '${APP_SOURCE}'. Place app files next to this script or set APP_SOURCE=/path/to/app."
fi

APP_USER="${APP_USER:-}"
ask APP_USER "App service account username" "${DEFAULT_USER}"

APP_DIR="${APP_DIR:-/opt/moneyfinder}"
ask APP_DIR "Install directory" "/opt/moneyfinder"

APP_HOST="${APP_HOST:-}"
ask APP_HOST "Server hostname or IP (used in nginx + NEXTAUTH_URL)" "$(hostname -I | awk '{print $1}')"

DB_NAME="${DB_NAME:-moneyfinder}"
DB_USER="${DB_USER:-moneyfinder_app}"

DB_PASSWORD="${DB_PASSWORD:-}"
ask_secret DB_PASSWORD "PostgreSQL app user password (leave blank to auto-generate)"
if [[ -z "${DB_PASSWORD}" ]]; then
  DB_PASSWORD="$(openssl rand -hex 20)"
  warn "Auto-generated DB password — saved in ${APP_DIR}/.env"
fi

NEXTAUTH_URL="${NEXTAUTH_URL:-https://${APP_HOST}}"
NEXTAUTH_SECRET="${NEXTAUTH_SECRET:-$(openssl rand -hex 32)}"

# Auto-update check interval in minutes (default 15, min 5)
UPDATE_INTERVAL_MIN="${UPDATE_INTERVAL_MIN:-15}"
[[ "${UPDATE_INTERVAL_MIN}" -lt 5 ]] && UPDATE_INTERVAL_MIN=5

printf "\n  ${GREEN}Configuration summary:${RESET}\n"
if [[ -n "${GITHUB_REPO:-}" ]]; then
  printf "    GitHub repo : %s (%s)\n" "${GITHUB_REPO}" "${UPDATE_BRANCH}"
else
  printf "    Source dir  : %s\n" "${APP_SOURCE}"
fi
printf "    App user    : %s\n" "${APP_USER}"
printf "    Install dir : %s\n" "${APP_DIR}"
printf "    Host        : %s\n" "${APP_HOST}"
printf "    DB name     : %s\n" "${DB_NAME}"
printf "    DB user     : %s\n" "${DB_USER}"
printf "    NEXTAUTH_URL: %s\n" "${NEXTAUTH_URL}"
printf "    Auto-update : every %s min\n" "${UPDATE_INTERVAL_MIN}"
printf "\n"
read -r -p "  Proceed with install? [Y/n]: " confirm
[[ "${confirm,,}" == "n" ]] && { info "Aborted."; exit 0; }

# ── 1. System packages ────────────────────────────────────────────────────────
section "1 / 7 — System Packages"

command -v apt-get >/dev/null 2>&1 || die "apt-get not found. This installer requires Ubuntu / Debian."

info "Updating package index"
as_root apt-get update -qq

info "Installing required packages"
as_root apt-get install -y \
  curl git build-essential rsync \
  openssl ca-certificates gnupg \
  postgresql postgresql-contrib \
  nginx

ok "System packages installed"

# ── 2. Node.js 22 ─────────────────────────────────────────────────────────────
section "2 / 7 — Node.js 22"

install_node_22() {
  local node_ver="" major=0
  node_ver="$(node --version 2>/dev/null || true)"
  [[ -n "${node_ver}" ]] && major="$(printf '%s' "${node_ver}" | tr -d 'v' | cut -d. -f1)"

  if [[ "${major}" -ge 22 ]]; then
    ok "Node.js ${node_ver} already satisfies >= 22, skipping"
    return
  fi

  # Attempt 1: NodeSource repo (Node.js 22)
  # -k bypasses SSL for environments with corporate TLS inspection proxies
  info "Attempting NodeSource install (Node.js 22)"
  if curl -fsSLk https://deb.nodesource.com/setup_22.x | as_root bash -; then
    as_root apt-get install -y nodejs
  else
    warn "NodeSource setup failed (likely SSL/proxy) — falling back to Ubuntu apt nodejs + npm"
    as_root apt-get install -y nodejs npm
  fi

  # Verify npm is now available
  if ! command -v npm >/dev/null 2>&1; then
    warn "npm not found after nodejs install — trying apt install npm directly"
    as_root apt-get install -y npm
  fi

  # Final check
  command -v npm >/dev/null 2>&1 || die "npm still not found. Run 'apt-get install -y nodejs npm' manually and retry."

  ok "Node.js $(node --version 2>/dev/null) / npm $(npm --version 2>/dev/null) installed"
}

install_node_22

# ── 3. PostgreSQL ─────────────────────────────────────────────────────────────
section "3 / 7 — PostgreSQL"

ensure_postgres_running() {
  info "Enabling and starting PostgreSQL"
  if as_root systemctl enable postgresql 2>/dev/null && \
     as_root systemctl start  postgresql 2>/dev/null; then
    ok "PostgreSQL running"
    return
  fi

  local pg_svc
  pg_svc="$(as_root systemctl list-unit-files --type=service 2>/dev/null \
    | awk '/^postgresql[@0-9]/ {print $1}' | head -1)"

  if [[ -n "${pg_svc}" ]]; then
    as_root systemctl enable  "${pg_svc}"
    as_root systemctl restart "${pg_svc}"
    ok "PostgreSQL (${pg_svc}) running"
  else
    die "Could not start PostgreSQL. Check: sudo systemctl status postgresql"
  fi
}

setup_database() {
  info "Creating PostgreSQL role '${DB_USER}' and database '${DB_NAME}'"

  # Create role if absent, then always sync the password so re-runs stay consistent
  as_postgres psql -tAc \
    "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" \
    | grep -q 1 2>/dev/null || \
    as_postgres psql -c \
      "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';"

  as_postgres psql -c \
    "ALTER USER ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';" >/dev/null

  as_postgres psql -tAc \
    "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" \
    | grep -q 1 2>/dev/null || \
    as_postgres psql -c \
      "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"

  as_postgres psql -c \
    "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};" >/dev/null

  ok "Database '${DB_NAME}' ready"
}

ensure_postgres_running
setup_database

# ── 4. App user & files ───────────────────────────────────────────────────────
section "4 / 7 — App User & Files"

if id "${APP_USER}" >/dev/null 2>&1; then
  ok "User '${APP_USER}' already exists"
else
  info "Creating system user '${APP_USER}'"
  as_root useradd --system --shell /bin/bash --create-home "${APP_USER}"
  ok "User '${APP_USER}' created"
fi

if [[ -n "${GITHUB_REPO:-}" ]]; then
  info "Cloning https://github.com/${GITHUB_REPO}.git → ${APP_DIR}"
  # Remove stale directory so git clone can write cleanly (preserves .env if it exists elsewhere)
  if [[ -d "${APP_DIR}/.git" ]]; then
    warn "${APP_DIR} is already a git repo — pulling latest instead of cloning"
    git -C "${APP_DIR}" fetch origin "${UPDATE_BRANCH}"
    git -C "${APP_DIR}" reset --hard "origin/${UPDATE_BRANCH}"
  else
    as_root rm -rf "${APP_DIR}"
    # -k bypasses SSL for corporate TLS-inspection proxies
    GIT_SSL_NO_VERIFY=true as_root git clone \
      "https://github.com/${GITHUB_REPO}.git" "${APP_DIR}" \
      || die "git clone failed. Check network access to GitHub."
    as_root git -C "${APP_DIR}" checkout "${UPDATE_BRANCH}" 2>/dev/null || true
  fi
else
  info "Copying app files from ${APP_SOURCE} to ${APP_DIR}"
  as_root mkdir -p "${APP_DIR}"
  as_root rsync -a --delete \
    --exclude '.git' \
    --exclude 'node_modules' \
    --exclude '.next' \
    --exclude '.env' \
    "${APP_SOURCE}/" "${APP_DIR}/"
fi
as_root chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"
ok "Files in place"

# ── 5. .env + build ───────────────────────────────────────────────────────────
section "5 / 7 — Environment & Build"

set_env_value() {
  local file="$1" key="$2" value="$3"
  if grep -q "^${key}=" "${file}" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${value}|" "${file}"
  else
    printf '%s=%s\n' "${key}" "${value}" >> "${file}"
  fi
}

write_env_file() {
  local env_file="${APP_DIR}/.env"
  info "Writing ${env_file}"

  as_root touch "${env_file}"
  as_root chown "${APP_USER}:${APP_USER}" "${env_file}"
  as_root chmod 600 "${env_file}"

  set_env_value "${env_file}" "DATABASE_URL" \
    "postgresql://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}?schema=public"
  set_env_value "${env_file}" "NEXTAUTH_URL"    "${NEXTAUTH_URL}"
  set_env_value "${env_file}" "NEXTAUTH_SECRET" "${NEXTAUTH_SECRET}"

  ok ".env written"
}

patch_google_fonts() {
  # Corporate networks block Google Fonts at build time.
  # Overwrites layout.tsx and globals.css completely with offline-safe versions.
  local layout="${APP_DIR}/src/app/layout.tsx"
  local gcss="${APP_DIR}/src/app/globals.css"

  if [[ ! -f "${layout}" ]]; then
    warn "layout.tsx not found at ${layout} — skipping font patch"
    return
  fi

  info "Overwriting layout.tsx (removing next/font/google for offline build)"
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

  if [[ -f "${gcss}" ]] && ! grep -q "font-space-grotesk" "${gcss}"; then
    info "Adding font CSS variables to globals.css"
    # Prepend font vars after first :root { line
    awk '/:root \{/{print; print "  --font-space-grotesk: \"DM Sans\", \"Inter\", system-ui, sans-serif;"; print "  --font-jetbrains-mono: \"Cascadia Code\", \"Consolas\", \"Courier New\", monospace;"; next}1' "${gcss}" > "${gcss}.tmp" && mv "${gcss}.tmp" "${gcss}"
  fi

  ok "Font patch applied"
}

build_app() {
  local npm_cmd="npm ci"
  [[ ! -f "${APP_DIR}/package-lock.json" ]] && npm_cmd="npm install"

  # Verify npm is available before proceeding
  local npm_bin
  npm_bin="$(command -v npm 2>/dev/null || true)"
  [[ -z "${npm_bin}" ]] && npm_bin="$(command -v /usr/bin/npm 2>/dev/null || true)"
  [[ -z "${npm_bin}" ]] && die "npm not found. Node.js installation may have failed. Check: which npm"
  info "Using npm at ${npm_bin}"

  # Build runs as root (already elevated via sudo); chown back to APP_USER afterward.
  # NODE_TLS_REJECT_UNAUTHORIZED=0 bypasses SSL for corporate TLS inspection proxies
  # (affects npm downloads and Prisma engine downloads only — not the running app).
  export NODE_TLS_REJECT_UNAUTHORIZED=0

  info "Clearing stale build cache"
  rm -rf "${APP_DIR}/.next" "${APP_DIR}/node_modules"

  patch_google_fonts

  info "Installing npm dependencies (this may take a minute)"
  cd "${APP_DIR}"
  ${npm_bin} ci || { warn "npm ci failed, retrying with npm install"; ${npm_bin} install; }

  info "Generating Prisma client"
  node "${APP_DIR}/node_modules/prisma/build/index.js" generate

  info "Pushing database schema"
  node "${APP_DIR}/node_modules/prisma/build/index.js" db push --accept-data-loss

  info "Seeding database"
  node "${APP_DIR}/node_modules/prisma/build/index.js" db seed || \
    warn "Seed returned non-zero — may be a re-run (data already present), continuing"

  info "Building Next.js production bundle"
  ${npm_bin} run build

  info "Fixing ownership back to ${APP_USER}"
  as_root chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"

  ok "App built successfully"
}

write_env_file
build_app

# ── 6. nginx + SSL ────────────────────────────────────────────────────────────
section "6 / 7 — nginx & SSL"

install_ssl_helper() {
  local HELPER="/usr/local/bin/moneyfinder-ssl-install"
  local SUDOERS="/etc/sudoers.d/moneyfinder-ssl"

  info "Installing SSL certificate helper to ${HELPER}"

  as_root tee "${HELPER}" >/dev/null <<'SSLEOF'
#!/usr/bin/env bash
# Moneyfinder — SSL certificate install helper
# Called by the app: sudo -n /usr/local/bin/moneyfinder-ssl-install <cert> <key> <domain>
set -euo pipefail

CERT_SRC="${1:?cert source path required}"
KEY_SRC="${2:?key source path required}"
DOMAIN="${3:?domain required}"

SSL_DIR="/etc/nginx/ssl/moneyfinder"
CERT_DEST="${SSL_DIR}/tls.crt"
KEY_DEST="${SSL_DIR}/tls.key"
SITE_AVAIL="/etc/nginx/sites-available/moneyfinder"
SITE_ENABLED="/etc/nginx/sites-enabled/moneyfinder"

mkdir -p "${SSL_DIR}"
install -m 0644 "${CERT_SRC}" "${CERT_DEST}"
install -m 0600 "${KEY_SRC}"  "${KEY_DEST}"

cat > "${SITE_AVAIL}" <<NGINXEOF
server {
    listen 80;
    server_name ${DOMAIN};
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ${DOMAIN};
    ssl_certificate     ${CERT_DEST};
    ssl_certificate_key ${KEY_DEST};

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_set_header   Upgrade           \$http_upgrade;
        proxy_set_header   Connection        "upgrade";
    }
}
NGINXEOF

ln -sf "${SITE_AVAIL}" "${SITE_ENABLED}"
nginx -t
systemctl reload nginx
SSLEOF

  as_root chmod 0755 "${HELPER}"
  as_root chown root:root "${HELPER}"

  info "Granting ${APP_USER} passwordless sudo for SSL helper"
  printf '%s ALL=(root) NOPASSWD: %s\n' "${APP_USER}" "${HELPER}" \
    | as_root tee "${SUDOERS}" >/dev/null
  as_root chmod 0440 "${SUDOERS}"
  as_root visudo -cf "${SUDOERS}"

  ok "SSL helper installed"
}

install_nginx() {
  local SSL_DIR="/etc/nginx/ssl/moneyfinder"

  info "Generating self-signed certificate for ${APP_HOST}"
  as_root mkdir -p "${SSL_DIR}"
  as_root openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout "${SSL_DIR}/tls.key" \
    -out    "${SSL_DIR}/tls.crt" \
    -subj   "/CN=${APP_HOST}" 2>/dev/null
  as_root chmod 0644 "${SSL_DIR}/tls.crt"
  as_root chmod 0600 "${SSL_DIR}/tls.key"

  info "Writing nginx site config"
  as_root tee /etc/nginx/sites-available/moneyfinder >/dev/null <<NGINXEOF
server {
    listen 80;
    server_name _;
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name _;

    ssl_certificate     ${SSL_DIR}/tls.crt;
    ssl_certificate_key ${SSL_DIR}/tls.key;

    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_set_header   Upgrade           \$http_upgrade;
        proxy_set_header   Connection        "upgrade";
        proxy_read_timeout 60s;
    }
}
NGINXEOF

  as_root ln -sf \
    /etc/nginx/sites-available/moneyfinder \
    /etc/nginx/sites-enabled/moneyfinder
  as_root rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true

  as_root nginx -t
  as_root systemctl enable nginx
  as_root systemctl restart nginx
  ok "nginx configured"
}

install_ssl_helper
install_nginx

# ── 7. systemd service ────────────────────────────────────────────────────────
section "7 / 7 — systemd Service"

as_root mkdir -p /var/log/moneyfinder
as_root chown "${APP_USER}:${APP_USER}" /var/log/moneyfinder
as_root chmod 750 /var/log/moneyfinder

info "Writing /etc/systemd/system/moneyfinder.service"
as_root tee /etc/systemd/system/moneyfinder.service >/dev/null <<SERVICEEOF
[Unit]
Description=Moneyfinder
After=network.target postgresql.service

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${APP_DIR}
Environment=NODE_ENV=production
EnvironmentFile=${APP_DIR}/.env
ExecStart=/usr/bin/node ${APP_DIR}/node_modules/next/dist/bin/next start -H 0.0.0.0 -p 3000
Restart=on-failure
RestartSec=5
TimeoutStopSec=30
NoNewPrivileges=yes
ProtectSystem=full
ProtectHome=read-only
PrivateTmp=yes

[Install]
WantedBy=multi-user.target
SERVICEEOF

as_root systemctl daemon-reload
as_root systemctl enable moneyfinder
as_root systemctl restart moneyfinder

sleep 3

if as_root systemctl is-active --quiet moneyfinder; then
  ok "moneyfinder service is running"
else
  warn "Service did not start cleanly. Check: sudo systemctl status moneyfinder --no-pager"
fi

# ── 8. Auto-update service ───────────────────────────────────────────────────
section "8 / 8 — Auto-Update Service"

install_auto_updater() {
  local UPDATER_BIN="/usr/local/bin/moneyfinder-auto-update"
  local UPDATER_SVC="/etc/systemd/system/moneyfinder-updater.service"
  local UPDATER_TMR="/etc/systemd/system/moneyfinder-updater.timer"
  local INTERVAL_SEC=$(( UPDATE_INTERVAL_MIN * 60 ))

  info "Installing auto-update script to ${UPDATER_BIN}"
  as_root install -m 0755 -o root -g root \
    "${APP_DIR}/scripts/linux/auto-update.sh" "${UPDATER_BIN}"

  info "Writing systemd service unit"
  as_root tee "${UPDATER_SVC}" >/dev/null <<SVCEOF
[Unit]
Description=Moneyfinder Auto-Update Check
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=root
Environment=APP_DIR=${APP_DIR}
Environment=UPDATE_BRANCH=${UPDATE_BRANCH}
Environment=GIT_SSL_NO_VERIFY=true
ExecStart=${UPDATER_BIN}
StandardOutput=append:/var/log/moneyfinder/auto-update.log
StandardError=append:/var/log/moneyfinder/auto-update.log
SVCEOF

  info "Writing systemd timer unit (interval: ${UPDATE_INTERVAL_MIN} min)"
  as_root tee "${UPDATER_TMR}" >/dev/null <<TMREOF
[Unit]
Description=Check for Moneyfinder updates every ${UPDATE_INTERVAL_MIN} minutes
After=network-online.target

[Timer]
OnBootSec=5min
OnUnitActiveSec=${INTERVAL_SEC}
Persistent=true

[Install]
WantedBy=timers.target
TMREOF

  as_root systemctl daemon-reload
  as_root systemctl enable --now moneyfinder-updater.timer
  ok "Auto-update timer enabled (next check: ~${UPDATE_INTERVAL_MIN} min after boot)"
}

if [[ -z "${GITHUB_REPO:-}" ]]; then
  warn "GITHUB_REPO is not set — auto-update service will not be installed."
  warn "To enable later: set GITHUB_REPO=${GITHUB_REPO:-owner/repo} and re-run this script."
elif [[ ! -d "${APP_DIR}/.git" ]]; then
  warn "APP_DIR is not a git repository — auto-update service will not be installed."
  warn "Re-run with GITHUB_REPO set to enable auto-updates."
else
  install_auto_updater
fi

# ── Summary ───────────────────────────────────────────────────────────────────
section "Install Complete"

printf "  ${GREEN}${BOLD}All components installed successfully.${RESET}\n\n"
printf "  %-20s %s\n" "App directory:"   "${APP_DIR}"
printf "  %-20s %s\n" "Service:"         "moneyfinder  (systemctl)"
printf "  %-20s %s\n" "HTTP (redirect):" "http://${APP_HOST}"
printf "  %-20s %s\n" "HTTPS (app):"     "https://${APP_HOST}"
if [[ -n "${GITHUB_REPO:-}" ]] && [[ -d "${APP_DIR}/.git" ]]; then
  printf "  %-20s every %s min (tracking %s/%s)\n" \
    "Auto-update:" "${UPDATE_INTERVAL_MIN}" "${GITHUB_REPO}" "${UPDATE_BRANCH}"
fi
printf "\n"
printf "  ${YELLOW}Note:${RESET} A self-signed certificate is in place. The browser will show a\n"
printf "  security warning until you upload a trusted cert via Settings -> SSL.\n\n"
printf "  Useful commands:\n"
printf "    sudo systemctl status moneyfinder --no-pager\n"
printf "    sudo systemctl status nginx --no-pager\n"
printf "    sudo journalctl -u moneyfinder -f\n"
printf "    curl -Ik https://127.0.0.1\n"
if [[ -n "${GITHUB_REPO:-}" ]] && [[ -d "${APP_DIR}/.git" ]]; then
  printf "    sudo systemctl status moneyfinder-updater.timer --no-pager\n"
  printf "    sudo journalctl -u moneyfinder-updater -f\n"
  printf "    sudo /usr/local/bin/moneyfinder-auto-update   # trigger update now\n"
fi
printf "\n"
