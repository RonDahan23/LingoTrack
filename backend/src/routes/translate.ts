import { Router } from 'express';
import { asyncHandler, requireAuth } from '../middleware/requireAuth.js';
import { HttpError } from '../middleware/errorHandler.js';
import { translateToHebrew, TranslationError } from '../services/translationService.js';

export const translateRouter: Router = Router();

translateRouter.use(requireAuth);

/**
 * English → Hebrew for a word or a full lyric line. `?text=` in the query.
 * Cached server-side; used by the player's word tooltip and line-translate.
 */
translateRouter.get(
  '/translate',
  asyncHandler(async (req, res) => {
    const text = req.query.text;
    if (typeof text !== 'string' || text.trim().length === 0) {
      throw new HttpError(400, 'text query parameter is required');
    }

    try {
      const translation = await translateToHebrew(text);
      res.json({ source: text, target: 'he', translation });
    } catch (err) {
      if (err instanceof TranslationError) {
        throw new HttpError(502, err.message);
      }
      throw err;
    }
  }),
);
