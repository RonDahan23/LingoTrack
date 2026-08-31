import { Router } from 'express';
import { z } from 'zod';

import { EXERCISE_TYPES, MAX_SESSION_SIZE, DEFAULT_SESSION_SIZE } from '../config/wordBank.js';
import { asyncHandler, requireAuth } from '../middleware/requireAuth.js';
import { HttpError } from '../middleware/errorHandler.js';
import { PracticeError, buildSession, submitReview } from '../services/practiceService.js';
import { getStats } from '../services/wordBankService.js';

export const practiceRouter: Router = Router();

practiceRouter.use(requireAuth);

/**
 * A ready-to-render practice session.
 *
 * Returns generated exercises rather than raw words so the client never has to
 * reimplement distractor selection — and so the correct answer is decided
 * server-side. `dueCount` is reported separately because a session may be
 * shorter than the due queue (words with no usable exercise are skipped).
 */
practiceRouter.get(
  '/practice/session',
  asyncHandler(async (req, res) => {
    const userId = req.userId as string;

    const rawLimit = req.query.limit;
    let limit = DEFAULT_SESSION_SIZE;
    if (typeof rawLimit === 'string') {
      const parsed = Number.parseInt(rawLimit, 10);
      if (!Number.isFinite(parsed) || parsed < 1) {
        throw new HttpError(400, 'limit must be a positive integer');
      }
      limit = Math.min(parsed, MAX_SESSION_SIZE);
    }

    const session = await buildSession(userId, { limit });
    res.json({
      exercises: session.exercises,
      dueCount: session.dueCount,
      stats: await getStats(userId),
    });
  }),
);

const submitBody = z.object({
  wordId: z.string().min(1, 'wordId is required'),
  exerciseType: z.enum(EXERCISE_TYPES),
  correct: z.boolean(),
  responseMs: z.number().int().nonnegative().max(600_000).optional().nullable(),
});

/**
 * Records one graded answer and returns the word's new schedule.
 *
 * The response carries the updated word so the client can show "next review in
 * 3 days" and re-render mastery without a follow-up fetch.
 */
practiceRouter.post(
  '/practice/submit',
  asyncHandler(async (req, res) => {
    const userId = req.userId as string;
    const parsed = submitBody.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid body');
    }

    try {
      const result = await submitReview({ userId, ...parsed.data });
      res.json(result);
    } catch (err) {
      if (err instanceof PracticeError) throw new HttpError(404, err.message);
      throw err;
    }
  }),
);
