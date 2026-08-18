import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash("Admin@123", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@megh.com" },
    update: {},
    create: {
      name: "Super Admin",
      email: "admin@megh.com",
      password: hashedPassword,
      role: Role.SUPERADMIN,
    },
  });

  console.log(" Admin seeded:", admin.id, admin.email, admin.role);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(" Seed failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });