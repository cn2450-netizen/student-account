#!/usr/bin/env bash
# =============================================================================
# Student Account Tracker — Linux Production Install
# Run once to set up the production environment on a Linux server.
# Usage: bash /path/to/student-account/scripts/linux/install-student-account.sh
# =============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_DIR="$HOME/student-account"
DB_NAME="student_account"
DB_USER="postgres"
DB_PASS="postgres"
APP_PORT="3000"

BOLD='\033[1m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RESET='\033[0m'

step() { echo -e "\n${BOLD}${CYAN}[$1]${RESET} $2"; }
ok()   { echo -e "${GREEN}  ✓ $1${RESET}"; }
warn() { echo -e "${YELLOW}  ! $1${RESET}"; }

echo -e "${BOLD}======================================================${RESET}"
echo -e "${BOLD}  Student Account Tracker — Production Install${RESET}"
echo -e "${BOLD}======================================================${RESET}"

# ─── Step 1: Install Node.js ─────────────────────────────────────────────────
step "1/7" "Installing Node.js 22..."

if command -v node &>/dev/null && node -e "process.exit(Number(process.version.slice(1).split('.')[0]) >= 20 ? 0 : 1)" 2>/dev/null; then
  ok "Node.js already installed: $(node --version)"
else
  sudo apt-get update -qq
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
  ok "Node.js installed: $(node --version)"
fi

# ─── Step 3: Install PM2 ─────────────────────────────────────────────────────
step "3/8" "Installing PM2..."

if command -v pm2 &>/dev/null; then
  ok "PM2 already installed: $(pm2 --version)"
else
  sudo npm install -g pm2
  ok "PM2 installed"
fi

# ─── Step 4: Install and start PostgreSQL ────────────────────────────────────
step "4/8" "Setting up PostgreSQL..."

if ! dpkg -l postgresql 2>/dev/null | grep -q "^ii"; then
  sudo apt-get update -qq
  sudo apt-get install -y postgresql postgresql-contrib
  ok "PostgreSQL installed"
else
  ok "PostgreSQL already installed"
fi

sudo service postgresql start 2>/dev/null || \
  sudo pg_ctlcluster "$(pg_lsclusters -h | awk '{print $1}' | head -1)" main start 2>/dev/null || true
sleep 2

sudo -u postgres psql -c "ALTER USER $DB_USER WITH PASSWORD '$DB_PASS';" 2>/dev/null && ok "postgres user password set"
sudo -u postgres createdb "$DB_NAME" 2>/dev/null && ok "Database '$DB_NAME' created" || warn "Database already exists (skipping)"

# ─── Step 4: Sync project files ──────────────────────────────────────────────
step "4/7" "Syncing project files from repo..."

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
  "$REPO_ROOT/" "$APP_DIR/"
ok "Files synced"

# ─── Step 5: Configure environment ───────────────────────────────────────────
step "5/7" "Configuring environment..."

if [ ! -f "$APP_DIR/.env" ]; then
  SECRET=$(tr -dc 'A-Za-z0-9!@#%^&*' < /dev/urandom 2>/dev/null | head -c 48 || openssl rand -hex 24)
  cat > "$APP_DIR/.env" <<EOF
# Student Account Tracker — Production
NODE_ENV=production
NEXTAUTH_URL=http://localhost:${APP_PORT}
NEXTAUTH_SECRET=${SECRET}
DATABASE_URL=postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:5432/${DB_NAME}?schema=public
NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt
EOF
  ok ".env created"
else
  # Ensure NODE_EXTRA_CA_CERTS is present in existing .env
  if ! grep -q "NODE_EXTRA_CA_CERTS" "$APP_DIR/.env"; then
    echo "NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt" >> "$APP_DIR/.env"
  fi
  ok ".env already exists (keeping existing)"
fi

# ─── Step 7: Install deps, push schema, seed, build ─────────────────────────
step "7/8" "Installing packages, migrating database, and building..."

export NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt
cd "$APP_DIR"

npm install
ok "npm packages installed"

npx prisma generate
ok "Prisma client generated"

npx prisma db push --accept-data-loss
ok "Schema pushed"

npx prisma db seed
ok "Admin user seeded (admin / admin — must change password on first login)"

npm run build
ok "Production build complete"

# ─── Step 8: Start with PM2 ──────────────────────────────────────────────────
step "8/8" "Starting application with PM2..."

# Stop any existing instance first
pm2 stop student-account 2>/dev/null || true
pm2 delete student-account 2>/dev/null || true

pm2 start npm --name "student-account" -- start -- -p "$APP_PORT"
pm2 save

ok "Application started with PM2"

# Attempt to configure PM2 startup (may require manual step — see output below)
echo ""
warn "To make the app survive reboots, run the startup command PM2 prints below:"
pm2 startup 2>/dev/null || true

echo ""
echo -e "${BOLD}======================================================${RESET}"
echo -e "${GREEN}${BOLD}  Production install complete!${RESET}"
echo -e "${BOLD}======================================================${RESET}"
echo ""
echo -e "  URL:    ${CYAN}http://localhost:${APP_PORT}${RESET}"
echo -e "  Admin:  ${CYAN}admin${RESET} / ${CYAN}admin${RESET}  (must change password on first login)"
echo ""
echo -e "  To deploy updates from this server, run:"
echo -e "  ${CYAN}bash $APP_DIR/scripts/linux/upgrade-student-account.sh${RESET}"
echo ""
