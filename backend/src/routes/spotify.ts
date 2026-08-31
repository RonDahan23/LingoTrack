import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, requireAuth } from '../middleware/requireAuth.js';
import { getValidAccessToken } from '../services/tokenService.js';

export const spotifyRouter: Router = Router();

spotifyRouter.use(requireAuth);

/**
 * Hands the caller's (decrypted, auto-refreshed) Spotify access token to the
 * browser so the Web Playback SDK can authenticate and stream full tracks.
 *
 * This is the one place a Spotify token leaves the server — unavoidable, since
 * the SDK runs client-side and needs it. It's the user's own token, scoped to
 * `streaming` + playback; the client should re-fetch (not cache long-term) as
 * the SDK's token-refresh callback fires.
 */
spotifyRouter.get(
  '/spotify/token',
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId as string } });
    const accessToken = await getValidAccessToken(user);
    res.json({ accessToken });
  }),
);
