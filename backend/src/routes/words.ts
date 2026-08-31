import { Router } from 'express';
import { z } from 'zod';

import { isWordStatus } from '../config/wordBank.js';
import { asyncHandler, requireAuth } from '../middleware/requireAuth.js';
import { HttpError } from '../middleware/errorHandler.js';
import {
  WordBankError,
  captureWord,
  deleteWord,
  getStats,
  getWord,
  listWords,
} from '../services/wordBankService.js';
import { getWordHistory } from '../services/practiceService.js';
import { TranslationError } from '../services/translationService.js';

export const wordsRouter: Router = Router();

wordsRouter.use(requireAuth);

const MAX_PAGE = 200;

const captureBody = z.object({
  word: z.string().min(1, 'word is required').max(80),
  contextLine: z.string().max(500).optional().nullable(),
  trackId: z.string().max(64).optional().nullable(),
  translation: z.string().max(200).optional().nullable(),
});

/**
 * Captures a tapped word into the caller's bank.
 *
 * Idempotent per word family: re-saving a word the learner already has
 * refreshes its enrichment and returns 200 rather than creating a duplicate or
 * erroring, so a double-tap in the player is harmless.
 */
wordsRouter.post(
  '/words',
  asyncHandler(async (req, res) => {
    const userId = req.userId as string;
    const parsed = captureBody.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid body');
    }

    try {
      const { entry, created } = await captureWord({ userId, ...parsed.data });
      res.status(created ? 201 : 200).json({ word: entry });
    } catch (err) {
      if (err instanceof WordBankError) throw new HttpError(422, err.message);
      if (err instanceof TranslationError) {
        throw new HttpError(502, 'Could not translate that word right now.');
      }
      throw err;
    }
  }),
);

/** The caller's saved words, newest-due first. Optional ?status= filter. */
wordsRouter.get(
  '/words',
  asyncHandler(async (req, res) => {
    const userId = req.userId as string;

    const statusFilter = req.query.status;
    if (typeof statusFilter === 'string' && !isWordStatus(statusFilter)) {
      throw new HttpError(400, 'Unknown status filter');
    }

    const limit = clampInt(req.query.limit, 50, 1, MAX_PAGE);
    const offset = clampInt(req.query.offset, 0, 0, Number.MAX_SAFE_INTEGER);

    const [{ words, total }, stats] = await Promise.all([
      listWords(userId, {
        status: typeof statusFilter === 'string' ? statusFilter : undefined,
        limit,
        offset,
      }),
      getStats(userId),
    ]);

    res.json({ words, total, stats });
  }),
);

/** Aggregate counts for the word-bank header and the practice call-to-action. */
wordsRouter.get(
  '/words/stats',
  asyncHandler(async (req, res) => {
    res.json({ stats: await getStats(req.userId as string) });
  }),
);

/** One word plus its recent review history. */
wordsRouter.get(
  '/words/:wordId',
  asyncHandler(async (req, res) => {
    const userId = req.userId as string;
    const wordId = req.params.wordId as string;

    const word = await getWord(userId, wordId);
    if (!word) throw new HttpError(404, 'Word not found in your bank');

    const history = (await getWordHistory(userId, wordId)) ?? [];
    res.json({ word, history });
  }),
);

wordsRouter.delete(
  '/words/:wordId',
  asyncHandler(async (req, res) => {
    const removed = await deleteWord(req.userId as string, req.params.wordId as string);
    if (!removed) throw new HttpError(404, 'Word not found in your bank');
    res.status(204).end();
  }),
);

/** Parses a bounded integer query param, falling back on anything unparseable. */
function clampInt(raw: unknown, fallback: number, min: number, max: number): number {
  if (typeof raw !== 'string') return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}
