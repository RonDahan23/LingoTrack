import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { fetchSession, submitAnswer } from '../api/practice';
import { AppHeader } from '../components/AppHeader';
import { ErrorState } from '../components/ErrorState';
import { ExerciseCard } from '../components/ExerciseCard';
import { Spinner } from '../components/Spinner';
import { ApiError } from '../lib/apiClient';
import { formatInterval, isAnswerCorrect, sessionMessage } from '../lib/practiceProgress';
import type { Exercise } from '../types/word';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; exercises: Exercise[] }
  | { status: 'empty' }
  | { status: 'error'; message: string };

/** Feedback shown after each answer. */
interface Feedback {
  correct: boolean;
  /** Days until this word comes back; null while the submission is in flight. */
  nextIntervalDays: number | null;
  justMastered: boolean;
}

/** A Duolingo-style run through the learner's due words. */
export function PracticePage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [score, setScore] = useState({ correct: 0, answered: 0 });

  // When the current question was shown — a fast answer grades higher.
  const shownAt = useRef<number>(Date.now());

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    setIndex(0);
    setSelected(null);
    setFeedback(null);
    setScore({ correct: 0, answered: 0 });
    try {
      const session = await fetchSession();
      setState(
        session.exercises.length === 0
          ? { status: 'empty' }
          : { status: 'ready', exercises: session.exercises },
      );
      shownAt.current = Date.now();
    } catch (err) {
      setState({
        status: 'error',
        message: err instanceof ApiError ? err.message : 'Could not start a practice session',
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const exercises = state.status === 'ready' ? state.exercises : [];
  const current = exercises[index];
  const finished = state.status === 'ready' && index >= exercises.length;

  const onAnswer = useCallback(
    async (choice: number) => {
      if (!current || feedback) return;
      const correct = isAnswerCorrect(current, choice);
      const responseMs = Date.now() - shownAt.current;

      setSelected(choice);
      setFeedback({ correct, nextIntervalDays: null, justMastered: false });
      setScore((s) => ({ correct: s.correct + (correct ? 1 : 0), answered: s.answered + 1 }));

      try {
        const result = await submitAnswer({
          wordId: current.wordId,
          exerciseType: current.type,
          correct,
          responseMs,
        });
        setFeedback({
          correct,
          nextIntervalDays: result.nextIntervalDays,
          justMastered: result.justMastered,
        });
      } catch {
        // The answer still counts locally; only the schedule hint is missing.
        setFeedback({ correct, nextIntervalDays: null, justMastered: false });
      }
    },
    [current, feedback],
  );

  const onNext = useCallback(() => {
    setIndex((i) => i + 1);
    setSelected(null);
    setFeedback(null);
    shownAt.current = Date.now();
  }, []);

  return (
    <div className="min-h-dvh">
      <AppHeader
        title="Practice"
        leading={
          <Link
            to="/words"
            aria-label="Back to word bank"
            className="rounded-full p-2 text-neutral-300 transition hover:bg-neutral-800 hover:text-white"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        }
        actions={
          state.status === 'ready' && !finished ? (
            <span className="text-sm tabular-nums text-neutral-400">
              {index + 1}/{exercises.length}
            </span>
          ) : null
        }
      />

      <main className="mx-auto max-w-3xl px-4 pb-28 pt-4">
        {state.status === 'loading' && <Spinner label="Building your session…" />}
        {state.status === 'error' && <ErrorState message={state.message} onRetry={load} />}
        {state.status === 'empty' && <NothingToPractise />}

        {state.status === 'ready' && (
          <>
            <ProgressBar value={index} total={exercises.length} />

            {finished ? (
              <SessionSummary
                correct={score.correct}
                total={score.answered}
                onAgain={load}
              />
            ) : (
              current && (
                <>
                  <div className="mt-6">
                    <ExerciseCard
                      exercise={current}
                      selectedIndex={selected}
                      revealed={feedback !== null}
                      onSelect={onAnswer}
                    />
                  </div>
                  {feedback && (
                    <FeedbackBar
                      feedback={feedback}
                      exercise={current}
                      onNext={onNext}
                      isLast={index === exercises.length - 1}
                    />
                  )}
                </>
              )
            )}
          </>
        )}
      </main>
    </div>
  );
}

function ProgressBar({ value, total }: { value: number; total: number }) {
  const pct = total === 0 ? 0 : Math.min(100, (value / total) * 100);
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-neutral-700">
      <div className="h-full bg-brand transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

function FeedbackBar({
  feedback,
  exercise,
  onNext,
  isLast,
}: {
  feedback: Feedback;
  exercise: Exercise;
  onNext: () => void;
  isLast: boolean;
}) {
  return (
    <div
      className={`fixed inset-x-0 bottom-0 border-t px-4 py-4 ${
        feedback.correct
          ? 'border-emerald-800 bg-emerald-950/95'
          : 'border-rose-800 bg-rose-950/95'
      } backdrop-blur`}
    >
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
        <div className="min-w-0">
          <p
            className={`font-semibold ${feedback.correct ? 'text-emerald-300' : 'text-rose-300'}`}
          >
            {feedback.correct ? 'Correct' : `Answer: ${exercise.options[exercise.answerIndex]}`}
          </p>
          <p className="truncate text-sm text-neutral-400">
            {exercise.word} — <span dir="rtl">{exercise.translation}</span>
            {feedback.nextIntervalDays !== null &&
              ` · back in ${formatInterval(feedback.nextIntervalDays)}`}
            {feedback.justMastered && ' · mastered!'}
          </p>
        </div>
        <button
          type="button"
          onClick={onNext}
          className="shrink-0 rounded-full bg-brand px-6 py-2.5 font-semibold text-black transition hover:brightness-110"
        >
          {isLast ? 'Finish' : 'Next'}
        </button>
      </div>
    </div>
  );
}

function SessionSummary({
  correct,
  total,
  onAgain,
}: {
  correct: number;
  total: number;
  onAgain: () => void;
}) {
  const pct = total === 0 ? 0 : Math.round((correct / total) * 100);
  return (
    <div className="py-16 text-center">
      <p className="text-5xl font-semibold tabular-nums text-white">{pct}%</p>
      <p className="mt-2 text-neutral-300">
        {correct} of {total} correct
      </p>
      <p className="mt-1 text-sm text-neutral-500">{sessionMessage(correct, total)}</p>

      <div className="mx-auto mt-8 flex max-w-xs flex-col gap-2">
        <button
          type="button"
          onClick={onAgain}
          className="w-full rounded-full bg-brand px-5 py-2.5 font-semibold text-black transition hover:brightness-110"
        >
          Practise again
        </button>
        <Link
          to="/words"
          className="w-full rounded-lg border border-neutral-700 bg-surface-raised px-4 py-2.5 text-sm font-medium text-neutral-200 transition hover:bg-surface-hover"
        >
          Back to word bank
        </Link>
      </div>
    </div>
  );
}

function NothingToPractise() {
  return (
    <div className="py-16 text-center text-neutral-400">
      <p>No words to practise yet.</p>
      <p className="mt-1 text-sm text-neutral-500">
        Tap words while a song plays to build your bank — they’ll show up here.
      </p>
      <Link
        to="/"
        className="mt-4 inline-block rounded-full bg-neutral-800 px-5 py-2 text-sm font-medium text-white transition hover:bg-neutral-700"
      >
        Find a song
      </Link>
    </div>
  );
}
