import "dotenv/config";
import { Client } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const targetUrl = new URL(databaseUrl);
const databaseName = targetUrl.pathname.replace(/^\//, "");

if (!databaseName) {
  console.error("DATABASE_URL does not include a database name.");
  process.exit(1);
}

if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(databaseName)) {
  console.error(`Database name '${databaseName}' is not supported by automatic creation.`);
  process.exit(1);
}

const adminUrl = new URL(databaseUrl);
adminUrl.pathname = "/postgres";

const client = new Client({ connectionString: adminUrl.toString() });

try {
  await client.connect();

  const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [databaseName]);
  if (exists.rowCount && exists.rowCount > 0) {
    console.log(`Database '${databaseName}' already exists.`);
    process.exit(0);
  }

  const quotedName = `"${databaseName.replace(/"/g, '""')}"`;
  await client.query(`CREATE DATABASE ${quotedName}`);
  console.log(`Created database '${databaseName}'.`);
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  console.error(`Failed to ensure database '${databaseName}': ${reason}`);
  process.exit(1);
} finally {
  await client.end().catch(() => undefined);
}
