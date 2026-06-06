import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

declare global {
  var prisma: PrismaClient | undefined;
}

const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/student_account?schema=public";

function createPrismaClient() {
  const pool = new Pool({
    connectionString,
    max: 10,                    // max simultaneous connections
    idleTimeoutMillis: 30_000,  // release idle connections after 30 s
    connectionTimeoutMillis: 3_000, // fail fast if pool is exhausted
  });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prisma = global.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}
