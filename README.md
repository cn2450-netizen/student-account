# Student Account Tracker

A web application for tracking student fundraising and expenses. Parents create accounts, list their students, and log fundraising income and expenses. Administrators review and approve account requests.

## Features

- Parent self-registration with admin approval queue
- Per-student fundraising and expense tracking
- Admin dashboard with system-wide reporting
- Force password change on first login
- Idle session timeout (60 min)
- Rate-limited login (10 attempts / 15 min per IP)

## Default Admin Account

The admin account username is `admin`. The password is randomly generated at install time and printed in the installer summary and the seed output. You will be prompted to set a new password on first login.

For local development (`npm run db:seed`), the password is also randomly generated and printed to the console. You can override it by setting `ADMIN_PASSWORD` in your environment before running the seed.

## Quick Start

### Production install (Ubuntu server)

```bash
sudo bash install-ubuntu.sh
```

The script installs Node.js, PostgreSQL, nginx, and the app as a systemd service. It generates a random DB password and admin password, prints them in the install summary, and writes `.env` automatically. See the script header for all overridable environment variables.

### Manual local setup

#### Prerequisites
- Node.js 20+
- PostgreSQL 16 instance (local or remote)

#### 1. Copy the environment file

```bash
cp .env.example .env
```

Edit `.env` — set `DATABASE_URL` to your Postgres connection string and `NEXTAUTH_SECRET` to a random 32+ character string (`openssl rand -hex 32`).

#### 2. Push schema, seed, and build

```bash
npm run db:push    # apply schema to database
npm run db:seed    # create admin user (password printed to console)
npm run build      # production build
npm start          # start on port 3000
```

Or for development:

```bash
npm run db:push
npm run db:seed
npm run dev
```

#### 3. Open the app

Navigate to **http://localhost:3000**

- Log in as `admin` with the password printed during the seed step, then set a new password.
- Parents can register via the **Create Account** button on the login page.
- Approve pending accounts at **Account Approvals** in the admin navigation.

## Parent Login Flow

1. Parent submits registration form → request goes to **PENDING** queue.
2. Admin checks the **Student Account Approval** checkbox and clicks **Approve**.
3. Parent logs in with their **email address** as username and **email address** as the initial password.
4. Parent is immediately required to set a new password.
5. Parent can then add students and log fundraising/expenses.

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm start` | Start production server |
| `npm run db:generate` | Regenerate Prisma client after schema changes |
| `npm run db:push` | Push schema changes to database |
| `npm run db:seed` | Seed admin user |
| `npm test` | Run unit tests |
| `npm run test:watch` | Run tests in watch mode |
