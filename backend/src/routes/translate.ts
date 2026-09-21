import { Router } from 'express';
import { asyncHandler, requireAuth } from '../middleware/requireAuth.js';
import { HttpError } from '../middleware/errorHandler.js';
import { translateToHebrew, TranslationError } from '../services/translationService.js';
import { lookupWord } from '../services/wordLookupService.js';

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

/**
 * A single tapped word, resolved against the line it appeared in.
 *
 * Separate from `/translate` rather than a flag on it: this returns a word
 * record (lemma, part of speech, every sense), not a string, and the line
 * translation has no use for any of that. `?line=` is optional but is what
 * makes the answer context-aware — see wordLookupService.
 */
translateRouter.get(
  '/lookup',
  asyncHandler(async (req, res) => {
    const word = req.query.word;
    if (typeof word !== 'string' || word.trim().length === 0) {
      throw new HttpError(400, 'word query parameter is required');
    }

    const line = typeof req.query.line === 'string' ? req.query.line : null;

    try {
      res.json(await lookupWord(word, line));
    } catch (err) {
      if (err instanceof TranslationError) throw new HttpError(502, err.message);
      throw err;
    }
  }),
);
