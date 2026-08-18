import { PrismaClient } from "@prisma/client";
const globalForPrisma = globalThis;
const basePrisma = globalForPrisma.prisma ??
    new PrismaClient({
    // log: ["query", "error", "warn"], // optional
    });
export const prisma = process.env.NODE_ENV === "production"
    ? basePrisma
    : basePrisma.$extends({
        query: {
            async $allOperations({ model, operation, args, query }) {
                const result = await query(args);
                console.log(`prisma:result ${model}.${operation} ->`, result);
                return result;
            },
        },
    });
if (process.env.NODE_ENV !== "production")
    globalForPrisma.prisma = basePrisma;
export default prisma;
//# sourceMappingURL=client.js.map