import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { deleteWord, fetchWords } from '../api/wordBank';
import { AppHeader } from '../components/AppHeader';
import { ErrorState } from '../components/ErrorState';
import { Spinner } from '../components/Spinner';
import { WordCard } from '../components/WordCard';
import { ApiError } from '../lib/apiClient';
import {
  WORD_STATUS_META,
  WORD_STATUS_ORDER,
  type WordBankEntry,
  type WordBankStats,
  type WordStatus,
} from '../types/word';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; words: WordBankEntry[]; stats: WordBankStats }
  | { status: 'error'; message: string };

/** The learner's saved vocabulary, grouped by learning status. */
export function WordBankPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [filter, setFilter] = useState<WordStatus | 'ALL'>('ALL');

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const data = await fetchWords(filter === 'ALL' ? undefined : filter);
      setState({ status: 'ready', words: data.words, stats: data.stats });
    } catch (err) {
      setState({
        status: 'error',
        message: err instanceof ApiError ? err.message : 'Could not load your word bank',
      });
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const onDelete = useCallback(async (wordId: string) => {
    // Optimistic: drop it immediately, restore by reloading if the call fails.
    setState((prev) =>
      prev.status === 'ready'
        ? { ...prev, words: prev.words.filter((w) => w.id !== wordId) }
        : prev,
    );
    try {
      await deleteWord(wordId);
    } catch {
      void load();
    }
  }, [load]);

  return (
    <div className="min-h-dvh">
      <AppHeader
        title="Word bank"
        leading={
          <Link
            to="/"
            aria-label="Back to dashboard"
            className="rounded-full p-2 text-neutral-300 transition hover:bg-neutral-800 hover:text-white"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        }
      />

      <main className="mx-auto max-w-3xl px-4 pb-28 pt-4">
        {state.status === 'loading' && <Spinner label="Loading your words…" />}
        {state.status === 'error' && <ErrorState message={state.message} onRetry={load} />}

        {state.status === 'ready' && (
          <>
            <StatsPanel stats={state.stats} />
            <FilterTabs active={filter} onSelect={setFilter} />

            {state.words.length === 0 ? (
              <EmptyState filtered={filter !== 'ALL'} />
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {state.words.map((word) => (
                  <li key={word.id}>
                    <WordCard word={word} onDelete={() => onDelete(word.id)} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function StatsPanel({ stats }: { stats: WordBankStats }) {
  return (
    <div className="rounded-xl bg-surface-raised p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-2xl font-semibold tabular-nums text-white">{stats.total}</p>
          <p className="text-sm text-neutral-400">words saved</p>
        </div>
        {stats.accuracy !== null && (
          <div className="text-right">
            <p className="text-2xl font-semibold tabular-nums text-white">
              {Math.round(stats.accuracy * 100)}%
            </p>
            <p className="text-sm text-neutral-400">accuracy</p>
          </div>
        )}
      </div>

      <div className="mt-3 flex gap-2 text-xs">
        {WORD_STATUS_ORDER.map((status) => {
          const meta = WORD_STATUS_META[status];
          const count =
            status === 'LEARNING' ? stats.learning : status === 'REVIEW' ? stats.review : stats.mastered;
          return (
            <span key={status} className={`rounded-full px-2 py-1 font-medium ${meta.badge}`}>
              {count} {meta.label.toLowerCase()}
            </span>
          );
        })}
      </div>

      {stats.due > 0 ? (
        <Link
          to="/practice"
          className="mt-4 block w-full rounded-full bg-brand px-5 py-2.5 text-center font-semibold text-black transition hover:brightness-110"
        >
          Practise {stats.due} {stats.due === 1 ? 'word' : 'words'}
        </Link>
      ) : (
        stats.total > 0 && (
          <Link
            to="/practice"
            className="mt-4 block w-full rounded-lg border border-neutral-700 bg-surface-raised px-4 py-2.5 text-center text-sm font-medium text-neutral-200 transition hover:bg-surface-hover"
          >
            Nothing due — practise anyway
          </Link>
        )
      )}
    </div>
  );
}

function FilterTabs({
  active,
  onSelect,
}: {
  active: WordStatus | 'ALL';
  onSelect: (value: WordStatus | 'ALL') => void;
}) {
  const tabs: { value: WordStatus | 'ALL'; label: string; activeClass: string }[] = [
    { value: 'ALL', label: 'All', activeClass: 'border-brand text-brand' },
    ...WORD_STATUS_ORDER.map((status) => ({
      value: status,
      label: WORD_STATUS_META[status].label,
      activeClass: WORD_STATUS_META[status].activeTab,
    })),
  ];

  return (
    <div className="mt-4 flex gap-1 border-b border-neutral-800">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          onClick={() => onSelect(tab.value)}
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${
            active === tab.value
              ? tab.activeClass
              : 'border-transparent text-neutral-400 hover:text-neutral-200'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="py-16 text-center text-neutral-400">
      {filtered ? (
        <p>No words at this stage yet.</p>
      ) : (
        <>
          <p>Your word bank is empty.</p>
          <p className="mt-1 text-sm text-neutral-500">
            Tap any word while a song is playing to save it here.
          </p>
          <Link
            to="/"
            className="mt-4 inline-block rounded-full bg-neutral-800 px-5 py-2 text-sm font-medium text-white transition hover:bg-neutral-700"
          >
            Find a song
          </Link>
        </>
      )}
    </div>
  );
}
