import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

export const healthRouter: Router = Router();

/** Liveness — process is up. Does not touch the database. */
healthRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) });
});

/** Readiness — verifies the SQL Server connection actually answers. */
healthRouter.get('/health/db', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', database: 'reachable' });
  } catch (err) {
    res.status(503).json({
      status: 'degraded',
      database: 'unreachable',
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});
