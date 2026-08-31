import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';

/**
 * A single PrismaClient for the process. Cached on globalThis so `tsx watch`
 * reloads in development don't leak a new connection pool on every restart.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
