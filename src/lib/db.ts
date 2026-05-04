/**
 * Prisma client singleton.
 *
 * Why a singleton: in development, Next.js hot-reloads server modules and
 * each reload would otherwise create a new Prisma client and exhaust the
 * Postgres connection pool. The `globalThis` cache pattern is the
 * Prisma-recommended workaround.
 */
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "production"
        ? ["error", "warn"]
        : ["query", "error", "warn"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
