import express from 'express';
import type { Express } from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { syncRouter } from './routes/sync.js';
import { tracksRouter } from './routes/tracks.js';
import { spotifyRouter } from './routes/spotify.js';
import { translateRouter } from './routes/translate.js';
import { wordsRouter } from './routes/words.js';
import { practiceRouter } from './routes/practice.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

/**
 * Builds the Express app without binding a port, so tests can exercise it
 * directly. Step 2 mounts the Spotify auth router here; Step 3 adds
 * /api/tracks/ranked.
 */
export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');

  // The Flutter Web SPA calls this API cross-origin (different port), so allow
  // its origin. Auth is via a Bearer header, not cookies, so credentials stay
  // off. The OAuth redirect endpoints are top-level browser navigations, not
  // XHR, so they don't depend on this.
  app.use(
    cors({
      origin: env.WEB_APP_URL,
      // DELETE is needed by the word bank (removing a saved word).
      methods: ['GET', 'POST', 'DELETE'],
      allowedHeaders: ['Authorization', 'Content-Type'],
    }),
  );

  app.use(express.json());

  app.use('/api', healthRouter);
  app.use('/api', authRouter);
  app.use('/api', syncRouter);
  app.use('/api', tracksRouter);
  app.use('/api', spotifyRouter);
  app.use('/api', translateRouter);
  app.use('/api', wordsRouter);
  app.use('/api', practiceRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
