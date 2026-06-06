import { hash } from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/student_account?schema=public";

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function seedAdmin() {
  const passwordHash = await hash("admin", 10);

  await prisma.user.upsert({
    where: { username: "admin" },
    update: {
      role: "ADMIN",
    },
    create: {
      username: "admin",
      passwordHash,
      role: "ADMIN",
      forcePasswordChange: true,
    },
  });

  console.log("Admin user seeded (username: admin, password: admin — change on first login).");
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
