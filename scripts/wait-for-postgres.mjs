import "dotenv/config";
import { Client } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const maxAttempts = Number.parseInt(process.env.POSTGRES_WAIT_ATTEMPTS ?? "30", 10);
const delayMs = Number.parseInt(process.env.POSTGRES_WAIT_DELAY_MS ?? "1000", 10);

const adminUrl = new URL(databaseUrl);
adminUrl.pathname = "/postgres";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  const client = new Client({ connectionString: adminUrl.toString() });
  try {
    await client.connect();
    await client.end();
    console.log(`PostgreSQL is ready after ${attempt} attempt(s).`);
    process.exit(0);
  } catch (error) {
    await client.end().catch(() => undefined);
    const reason = error instanceof Error ? error.message : String(error);
    console.log(`Waiting for PostgreSQL (${attempt}/${maxAttempts}): ${reason}`);
    await sleep(delayMs);
  }
}

console.error(`PostgreSQL did not become ready after ${maxAttempts} attempts.`);
process.exit(1);
