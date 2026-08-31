import { prisma } from '../lib/prisma.js';
import { processTrack } from './gradingService.js';
import { LrcLibProvider } from './lyrics/lrclibProvider.js';

/**
 * Background "analyze my library" job: walks the user's UNGRADED tracks,
 * fetches real synced lyrics (LRCLIB) and grades each, so they populate the
 * ranked tabs. Mirrors the sync job's in-process, single-instance state model.
 *
 * Non-English or lyric-less tracks stay UNGRADED (and stay hidden) — that's
 * expected, not a failure.
 */

export interface GradeJobState {
  status: 'idle' | 'running' | 'succeeded' | 'failed';
  total: number;
  processed: number;
  graded: number;
  startedAt?: Date;
  error?: string;
}

const states = new Map<string, GradeJobState>();
const provider = new LrcLibProvider();

// Small gap between external calls to stay a polite LRCLIB citizen.
const THROTTLE_MS = 150;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function getGradeState(userId: string): GradeJobState {
  return states.get(userId) ?? { status: 'idle', total: 0, processed: 0, graded: 0 };
}

export function isGrading(userId: string): boolean {
  return getGradeState(userId).status === 'running';
}

/** Starts grading in the background; ignores re-entrant calls for a busy user. */
export function startGradeLibrary(userId: string): { started: boolean; state: GradeJobState } {
  if (isGrading(userId)) return { started: false, state: getGradeState(userId) };

  const state: GradeJobState = {
    status: 'running',
    total: 0,
    processed: 0,
    graded: 0,
    startedAt: new Date(),
  };
  states.set(userId, state);

  void gradeLibrary(userId, state)
    .then(() => {
      state.status = 'succeeded';
      console.log(`[grade] user=${userId} done: ${state.graded}/${state.total} graded`);
    })
    .catch((err: unknown) => {
      state.status = 'failed';
      state.error = err instanceof Error ? err.message : String(err);
      console.error(`[grade] user=${userId} failed:`, err);
    });

  return { started: true, state: getGradeState(userId) };
}

/** Runs the grading pass synchronously. Exported for the maintenance script. */
export async function gradeLibrary(
  userId: string,
  state?: GradeJobState,
): Promise<{ graded: number; processed: number; total: number }> {
  const tracks = await prisma.track.findMany({
    where: { userProgress: { some: { userId } }, difficultyLevel: 'UNGRADED' },
    select: { id: true },
  });

  if (state) state.total = tracks.length;
  let graded = 0;
  let processed = 0;

  for (const track of tracks) {
    try {
      const outcome = await processTrack(track.id, provider);
      if (outcome.graded) graded++;
    } catch {
      // Skip a single track's failure; keep the batch going.
    }
    processed++;
    if (state) {
      state.processed = processed;
      state.graded = graded;
    }
    await sleep(THROTTLE_MS);
  }

  return { graded, processed, total: tracks.length };
}
