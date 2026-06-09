/**
 * Ensures .env exists with all required local-dev credentials.
 * Run automatically via `npm run db:setup-creds` (called by db:init:docker).
 *
 * Rules:
 *  - Never overwrites an existing value — safe to re-run at any time.
 *  - Always keeps DATABASE_URL in sync with POSTGRES_USER / POSTGRES_PASSWORD.
 *  - Prints the generated DB password once so the developer can note it down.
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ENV_FILE = resolve(process.cwd(), ".env");

// Parse existing .env preserving key order
const order = [];
const values = new Map();

if (existsSync(ENV_FILE)) {
  for (const line of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)/s);
    if (m) {
      if (!values.has(m[1])) order.push(m[1]);
      values.set(m[1], m[2]);
    }
  }
}

const get = (k) => values.get(k) ?? null;
const set = (k, v) => { if (!values.has(k)) order.push(k); values.set(k, v); };
const setIfAbsent = (k, v) => { if (values.has(k)) return false; set(k, v); return true; };

let changed = false;

setIfAbsent("NEXTAUTH_URL", "http://localhost:3000");
if (setIfAbsent("NEXTAUTH_SECRET", randomBytes(32).toString("hex"))) changed = true;

setIfAbsent("POSTGRES_USER", "student");
const pgUser = get("POSTGRES_USER");

let pgPass = get("POSTGRES_PASSWORD");
if (!pgPass) {
  pgPass = randomBytes(20).toString("hex");
  set("POSTGRES_PASSWORD", pgPass);
  changed = true;
  console.log("\n  ┌─────────────────────────────────────────────────────┐");
  console.log(`  │  Generated PostgreSQL password: ${pgPass.padEnd(22)}│`);
  console.log("  │  Saved to .env — do not commit .env to git          │");
  console.log("  └─────────────────────────────────────────────────────┘\n");
}

// Keep DATABASE_URL in sync with the Postgres creds
const expectedUrl = `postgresql://${pgUser}:${pgPass}@localhost:5432/student_account?schema=public`;
if (get("DATABASE_URL") !== expectedUrl) {
  set("DATABASE_URL", expectedUrl);
  changed = true;
}

if (changed) {
  writeFileSync(ENV_FILE, order.map((k) => `${k}=${values.get(k)}`).join("\n") + "\n", "utf8");
  console.log("  .env updated.");
} else {
  console.log("  .env already up to date — no changes needed.");
}
