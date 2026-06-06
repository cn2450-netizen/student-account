#!/usr/bin/env bash
# =============================================================================
# Student Account Tracker - WSL Dev Setup Script
# Run this once inside WSL: bash /mnt/c/Scripts/student\ account/scripts/linux/wsl-dev-setup.sh
# =============================================================================
set -euo pipefail

APP_DIR="$HOME/student-account"
WIN_PROJECT="/mnt/c/Scripts/student account"
DB_NAME="student_account"
DB_USER="postgres"
DB_PASS="postgres"
APP_PORT="3000"
WIN_CERTS_DIR="/mnt/c/Users/$(whoami)/AppData/Local/Temp/wsl-certs"

BOLD='\033[1m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RESET='\033[0m'

step() { echo -e "\n${BOLD}${CYAN}[$1]${RESET} $2"; }
ok()   { echo -e "${GREEN}  ✓ $1${RESET}"; }
warn() { echo -e "${YELLOW}  ! $1${RESET}"; }

echo -e "${BOLD}======================================================${RESET}"
echo -e "${BOLD}  Student Account Tracker — WSL Dev Setup${RESET}"
echo -e "${BOLD}======================================================${RESET}"

# ─── Step 1: Import Windows CA certificates ──────────────────────────────────
step "1/7" "Importing Windows CA certificates..."

if [ -d "$WIN_CERTS_DIR" ]; then
  sudo mkdir -p /usr/local/share/ca-certificates/windows-trust
  sudo cp "$WIN_CERTS_DIR"/*.crt /usr/local/share/ca-certificates/windows-trust/ 2>/dev/null || true
  CERT_COUNT=$(ls /usr/local/share/ca-certificates/windows-trust/*.crt 2>/dev/null | wc -l)
  sudo update-ca-certificates --fresh 2>&1 | grep -E "added|updated|removed" || true
  ok "Imported $CERT_COUNT Windows CA certificates"
else
  warn "Windows cert folder not found at $WIN_CERTS_DIR"
  warn "If apt/curl fails, export certs from Windows first (see README)"
fi

# ─── Step 2: Install Node.js via NodeSource ───────────────────────────────────
step "2/7" "Installing Node.js 22..."

if command -v node &>/dev/null && node -e "process.exit(Number(process.version.slice(1).split('.')[0]) >= 20 ? 0 : 1)" 2>/dev/null; then
  ok "Node.js already installed: $(node --version)"
else
  sudo apt-get update -qq
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
  ok "Node.js installed: $(node --version)"
fi

# ─── Step 3: Install and configure PostgreSQL ────────────────────────────────
step "3/7" "Setting up PostgreSQL..."

if ! dpkg -l postgresql 2>/dev/null | grep -q "^ii"; then
  sudo apt-get update -qq
  sudo apt-get install -y postgresql postgresql-contrib
  ok "PostgreSQL installed"
else
  ok "PostgreSQL already installed"
fi

# Start PostgreSQL (works on both systemd and SysV init in WSL)
sudo service postgresql start 2>/dev/null || sudo pg_ctlcluster "$(pg_lsclusters -h | awk '{print $1}' | head -1)" main start 2>/dev/null || true
sleep 2

# Set postgres password and create the application database
sudo -u postgres psql -c "ALTER USER $DB_USER WITH PASSWORD '$DB_PASS';" 2>/dev/null && ok "postgres user password set"
sudo -u postgres createdb "$DB_NAME" 2>/dev/null && ok "Database '$DB_NAME' created" || warn "Database '$DB_NAME' already exists (skipping)"

# ─── Step 4: Sync project files ──────────────────────────────────────────────
step "4/7" "Copying project files to $APP_DIR..."

if ! command -v rsync &>/dev/null; then
  sudo apt-get install -y rsync -qq
fi

mkdir -p "$APP_DIR"
rsync -a --delete \
  --exclude='node_modules/' \
  --exclude='.next/' \
  --exclude='.git/' \
  --exclude='.env' \
  --exclude='.env.*' \
  --no-perms \
  "$WIN_PROJECT/" "$APP_DIR/"

ok "Project files synced"

# ─── Step 5: Create .env ─────────────────────────────────────────────────────
step "5/7" "Configuring environment..."

if [ ! -f "$APP_DIR/.env" ]; then
  SECRET=$(tr -dc 'A-Za-z0-9!@#%^&*' < /dev/urandom 2>/dev/null | head -c 48 || openssl rand -hex 24)
  cat > "$APP_DIR/.env" <<EOF
# Student Account Tracker — Dev Environment (WSL)
NEXTAUTH_URL=http://localhost:${APP_PORT}
NEXTAUTH_SECRET=${SECRET}
DATABASE_URL=postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:5432/${DB_NAME}?schema=public
EOF
  ok ".env created with a random NEXTAUTH_SECRET"
else
  ok ".env already exists (keeping existing)"
fi

# ─── Step 6: Install npm packages + generate Prisma client ───────────────────
step "6/7" "Installing dependencies and generating Prisma client..."

# Node.js must use the system CA bundle so Prisma can download Linux engines
export NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt

cd "$APP_DIR"
npm install --prefer-offline 2>/dev/null || npm install
ok "npm packages installed"

npx prisma generate
ok "Prisma client generated (Linux binaries)"

# ─── Step 7: Push schema and seed admin user ─────────────────────────────────
step "7/7" "Initialising database schema and seeding..."

npx prisma db push --accept-data-loss
ok "Schema pushed"

npx prisma db seed
ok "Admin user seeded (admin / admin)"

# ─── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}======================================================${RESET}"
echo -e "${GREEN}${BOLD}  Setup complete!${RESET}"
echo -e "${BOLD}======================================================${RESET}"
echo ""
echo -e "  Start the dev server:  ${CYAN}cd ~/student-account && npm run dev${RESET}"
echo -e "  Or start in the background:  ${CYAN}cd ~/student-account && npm run dev &${RESET}"
echo ""
echo -e "  URL:    ${CYAN}http://localhost:${APP_PORT}${RESET}"
echo -e "  Admin:  ${CYAN}admin${RESET} / ${CYAN}admin${RESET}  (must change password on first login)"
echo ""
echo -e "  To re-sync code from Windows later, run:"
echo -e "  ${CYAN}bash /mnt/c/Scripts/student\\ account/scripts/linux/wsl-sync.sh${RESET}"
echo ""
