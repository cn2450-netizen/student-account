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

| Username | Password |
|----------|----------|
| `admin`  | `admin`  |

> The admin password **must** be changed on first login before the application can be used.

## Quick Start

### Prerequisites
- Node.js 20+
- Docker (or a local PostgreSQL 16 instance)

### 1. Copy the environment file

```bash
cp .env.example .env
```

Edit `.env` and set `NEXTAUTH_SECRET` to a random 32+ character string.

### 2. Initialize the database and build

```bash
npm run db:init        # starts Docker Postgres, creates DB, pushes schema, seeds admin
npm run build          # production build
npm start              # start on port 3000
```

Or for development:

```bash
npm run db:init
npm run dev
```

### 3. Open the app

Navigate to **http://localhost:3000**

- Log in as `admin` / `admin` and set a new password.
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
| `npm run db:up` | Start Docker Postgres container |
| `npm run db:down` | Stop Docker Postgres container |
| `npm run db:push` | Push schema to database |
| `npm run db:seed` | Seed admin user |
| `npm run db:init` | Full DB init (auto-detects Docker) |
| `npm run deploy:local` | DB init + production build |
