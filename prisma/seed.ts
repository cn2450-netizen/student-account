import { randomBytes } from "crypto";
import { hash } from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/student_account?schema=public";

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function seedAdmin() {
  const adminPassword = process.env.ADMIN_PASSWORD || randomBytes(12).toString("hex");
  const passwordHash = await hash(adminPassword, 10);

  const existing = await prisma.user.findUnique({ where: { username: "admin" } });

  await prisma.user.upsert({
    where: { username: "admin" },
    update: { role: "ADMIN" },
    create: {
      username: "admin",
      passwordHash,
      role: "ADMIN",
      forcePasswordChange: true,
    },
  });

  if (existing) {
    console.log("Admin user already exists — role confirmed, password unchanged.");
  } else {
    console.log(`Admin user created — username: admin  password: ${adminPassword}`);
    console.log("(You will be prompted to change this password on first login.)");
  }
}

async function main() {
  await seedAdmin();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
