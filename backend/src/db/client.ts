import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const basePrisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    // log: ["query", "error", "warn"], // optional
  });

export const prisma = basePrisma;

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = basePrisma;

export default prisma;
