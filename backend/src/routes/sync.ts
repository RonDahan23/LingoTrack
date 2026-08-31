import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, requireAuth } from '../middleware/requireAuth.js';
import { getSyncState, startLikedTracksSync } from '../services/syncService.js';

export const syncRouter: Router = Router();

syncRouter.use(requireAuth);

/**
 * Triggers ingestion and returns immediately — a large library takes many
 * paginated Spotify calls, far longer than a request should be held open.
 * 202 means accepted; 409 means one was already running.
 */
syncRouter.post('/sync/liked-tracks', (req, res) => {
  const { started, state } = startLikedTracksSync(req.userId as string);
  res.status(started ? 202 : 409).json({ started, state });
});

/** Poll target for the client's refresh spinner. */
syncRouter.get(
  '/sync/status',
  asyncHandler(async (req, res) => {
    const userId = req.userId as string;

    const [trackCount, ungradedCount] = await Promise.all([
      prisma.userTrackProgress.count({ where: { userId } }),
      prisma.userTrackProgress.count({
        where: { userId, track: { difficultyLevel: 'UNGRADED' } },
      }),
    ]);

    res.json({ state: getSyncState(userId), trackCount, ungradedCount });
  }),
);
