# Student Account Tracker

A web application for tracking student fundraising and expenses. Parents create accounts, list their students, and log fundraising income and expenses. Administrators review and approve account requests.

## Features

- Parent self-registration with admin approval queue
- Per-student fundraising and expense tracking
- Admin dashboard with system-wide reporting
- Force password change on first login
- Idle session timeout (60 min)
- Rate-limited login (10 attempts / 15 min per IP)
- Account lockout with progressive backoff; permanent lock requires president/admin to unlock
- Role-based access control (ADMIN, PRESIDENT, TREASURER, FUNDRAISING_MANAGER, BOARD_MEMBER, PARENT)
- Annual grade advancement with configurable rollover date
- Email notifications for deposit receipts and account approvals
- Email receipt log with 5-year retention, print view, and CSV export

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
2. Admin/president/treasurer checks the **Student Account Approval** checkbox and clicks **Approve**.
3. Parent receives an email notification (if SMTP is configured) with a login link.
4. Parent logs in with their **email address** as username and the password they set at registration (or their email address if no password was set).
5. Parent is immediately required to set a new password on first login.
6. Parent can then add students and log fundraising/expenses.

## Role Permissions

| Feature | ADMIN | PRESIDENT | TREASURER | FUNDRAISING_MGR | BOARD_MEMBER | PARENT |
|---------|:-----:|:---------:|:---------:|:---------------:|:------------:|:------:|
| All Students | ✓ | ✓ | ✓ | ✓ | ✓ (read-only) | — |
| All Fundraising | ✓ | ✓ | ✓ | ✓ | — | — |
| All Expenses | ✓ | ✓ | ✓ | — | — | — |
| Fundraisers (configure) | ✓ | — | ✓ | ✓ | — | — |
| Registered Parents | ✓ | ✓ | ✓ | ✓ | — | — |
| Fund Requests | ✓ | ✓ | ✓ | — | — | — |
| Account Approvals | ✓ | ✓ | ✓ | — | — | — |
| Email Receipts | ✓ | ✓ | ✓ | — | — | — |
| Unlock Locked Accounts | ✓ | ✓ | — | — | — | — |
| Settings | ✓ | ✓ | — | — | — | — |
| My Students / Fundraising | — | — | — | — | — | ✓ |

## Settings

All settings are accessible from the **Settings** menu (admin and president roles).

### User Accounts
Manage user accounts, reset passwords, and change roles.

### School Year
Configure the date each year when grades are advanced and grade-12 students are moved to the graduated list. Defaults to **July 1** if not configured. The advancement can also be triggered manually from **Graduated Students**.

### Email Notifications
Configure outgoing email for deposit receipts and account approval notifications.

**SMTP settings** — host, port, TLS toggle, username, password, and From address. The current active configuration is displayed at the top of the section. Leave the host blank to disable email sending (receipts are still logged).

**Templates** — subject line and HTML body for each notification type. Templates support placeholder variables that are substituted at send time:

| Template | Available variables |
|----------|-------------------|
| Deposit receipt | `{{parentName}}`, `{{studentName}}`, `{{amount}}`, `{{description}}`, `{{date}}` |
| Account approval | `{{parentName}}`, `{{loginUrl}}` |

A **Reset to Default** button restores the built-in template for each type. Use **Send Test Email** to verify your SMTP configuration — the test message is sent to the currently logged-in user's email address.

### SSL Certificate
View SSL certificate details and manage the application URL (HTTP/HTTPS).

### Permissions
Read-only overview of role-based access control for each user role.

### Locked Accounts *(admin / president only)*
View and unlock permanently locked user accounts.

## Email Receipts

Every time a fundraising deposit is recorded or an account is approved, the system saves a receipt log entry containing the rendered email content. Receipts are retained for **5 years** and are accessible to admin, president, and treasurer roles via **Email Receipts** in the navigation.

### Viewing and printing
Click **View / Print** on any receipt to open the detail page. The detail page shows the full email metadata (recipient, student, amount, delivery status) and the rendered HTML body. Click **Print Receipt** to open the browser print dialog — the sidebar and header are automatically hidden for a clean printout.

### CSV export
Use the **Export CSV** button on the receipts list to download all receipts for the selected year as a `.csv` file, suitable for importing into Excel or accounting software. Filter by year and type (deposit / approval) before exporting.

## Grade Advancement

Grades are advanced once per school year via **Graduated Students → Advance Grades**. The rollover date is configurable under **Settings → School Year** (defaults to July 1).

- Students in grades 1–11 move up one grade.
- Grade-12 students are marked as **graduated** and moved to the Graduated Students list.
- The system records the year of last advancement to prevent accidental double-runs.
- An admin or treasurer can force-run the advancement regardless of date.

Graduated students remain in the system for fund balance review. A treasurer or admin can approve a fund transfer for each graduated student.

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
