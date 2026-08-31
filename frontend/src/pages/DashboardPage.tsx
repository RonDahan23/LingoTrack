import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  fetchRankedTracks,
  getGradeStatus,
  startGradeLibrary,
  startLibrarySync,
  type GradeStatus,
} from '../api/tracks';
import { useAuth } from '../auth/AuthContext';
import { AppHeader } from '../components/AppHeader';
import { DifficultyTabs } from '../components/DifficultyTabs';
import { ErrorState } from '../components/ErrorState';
import { Spinner } from '../components/Spinner';
import { TrackTile } from '../components/TrackTile';
import { ApiError } from '../lib/apiClient';
import {
  DIFFICULTY_ORDER,
  type DifficultyLevel,
  type RankedTracks,
  type Track,
} from '../types/track';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; ranked: RankedTracks }
  | { status: 'error'; message: string };

export function DashboardPage() {
  const { logout } = useAuth();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [active, setActive] = useState<DifficultyLevel>('BEGINNER');
  const [syncNote, setSyncNote] = useState<string | null>(null);

  const [grade, setGrade] = useState<GradeStatus | null>(null);
  const pollRef = useRef<number | null>(null);

  // `silent` refetches ranked without flashing the full-screen spinner (used
  // while the grading job streams new tracks in).
  const load = useCallback(async (silent = false) => {
    if (!silent) setState({ status: 'loading' });
    try {
      const ranked = await fetchRankedTracks();
      setState({ status: 'ready', ranked });
    } catch (err) {
      if (!silent) {
        setState({
          status: 'error',
          message: err instanceof ApiError ? err.message : 'Failed to load your tracks',
        });
      }
    }
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current != null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // Poll grade progress; refresh the lists as tracks come in; stop when done.
  const startPolling = useCallback(() => {
    if (pollRef.current != null) return;
    pollRef.current = window.setInterval(async () => {
      try {
        const status = await getGradeStatus();
        setGrade(status);
        await load(true);
        if (status.status !== 'running') stopPolling();
      } catch {
        stopPolling();
      }
    }, 3000);
  }, [load, stopPolling]);

  useEffect(() => {
    void load();
    // If a grade job is already running (e.g. auto-started at login), track it.
    getGradeStatus()
      .then((status) => {
        setGrade(status);
        if (status.status === 'running') startPolling();
      })
      .catch(() => {});
    return stopPolling;
  }, [load, startPolling, stopPolling]);

  const onAnalyze = useCallback(async () => {
    try {
      await startGradeLibrary();
      setGrade({ status: 'running', total: 0, processed: 0, graded: 0 });
      startPolling();
    } catch (err) {
      setSyncNote(err instanceof ApiError ? err.message : 'Could not start analysis');
    }
  }, [startPolling]);

  const onSync = useCallback(async () => {
    setSyncNote('Syncing your library from Spotify…');
    try {
      await startLibrarySync();
      setSyncNote('Sync started — refresh in a moment to see new tracks.');
    } catch (err) {
      // 409 = a sync is already running (e.g. the one kicked off at login). That
      // isn't an error worth alarming the user with.
      if (err instanceof ApiError && err.status === 409) {
        setSyncNote('A sync is already in progress — check back shortly.');
      } else {
        setSyncNote(err instanceof ApiError ? err.message : 'Could not start sync');
      }
    }
  }, []);

  const counts = useMemo(() => tabCounts(state), [state]);

  return (
    <div className="min-h-dvh">
      <AppHeader
        title="Your Songs"
        actions={
          <>
            <Link
              to="/words"
              aria-label="Word bank"
              title="Word bank"
              className="rounded-full p-2 text-neutral-300 transition hover:bg-neutral-800 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                <path
                  d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
            <IconButton label="Sync from Spotify" onClick={onSync}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </IconButton>
            <IconButton label="Sign out" onClick={logout}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </IconButton>
          </>
        }
      />

      <DifficultyTabs active={active} counts={counts} onSelect={setActive} />

      <div className="mx-auto max-w-3xl px-4">
        <GradeBanner grade={grade} onAnalyze={onAnalyze} />
        {syncNote && <p className="pt-3 text-sm text-brand">{syncNote}</p>}
      </div>

      <main className="mx-auto max-w-3xl px-4 pb-24 pt-3">
        {state.status === 'loading' && <Spinner label="Loading your tracks…" />}
        {state.status === 'error' && (
          <ErrorState message={state.message} onRetry={() => load()} />
        )}
        {state.status === 'ready' && (
          <TrackListView tracks={state.ranked.levels[active]?.tracks ?? []} />
        )}
      </main>
    </div>
  );
}

function GradeBanner({
  grade,
  onAnalyze,
}: {
  grade: GradeStatus | null;
  onAnalyze: () => void;
}) {
  if (grade?.status === 'running') {
    const pct = grade.total > 0 ? Math.round((grade.processed / grade.total) * 100) : 0;
    return (
      <div className="mt-3 rounded-lg bg-surface-raised p-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-neutral-300">Analyzing your library…</span>
          <span className="tabular-nums text-neutral-400">
            {grade.processed}/{grade.total || '…'} · {grade.graded} graded
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-700">
          <div className="h-full bg-brand transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  }

  // Offer the action once idle (or after a finished run).
  return (
    <button
      type="button"
      onClick={onAnalyze}
      className="mt-3 w-full rounded-lg border border-neutral-700 bg-surface-raised px-4 py-2.5 text-sm font-medium text-neutral-200 transition hover:bg-surface-hover"
    >
      {grade?.status === 'succeeded'
        ? 'Analyze again — fetch lyrics for any new songs'
        : 'Analyze my library — fetch lyrics & grade all songs'}
    </button>
  );
}

function TrackListView({ tracks }: { tracks: Track[] }) {
  if (tracks.length === 0) {
    return (
      <div className="py-16 text-center text-neutral-400">
        <p className="font-medium text-neutral-300">Nothing here yet</p>
        <p className="mt-1 text-sm">
          Sync your library, then tracks appear once they're graded.
        </p>
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {tracks.map((track) => (
        <li key={track.id}>
          <TrackTile track={track} />
        </li>
      ))}
    </ul>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="rounded-full p-2 text-neutral-300 transition hover:bg-neutral-800 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      {children}
    </button>
  );
}

function tabCounts(state: LoadState): Record<DifficultyLevel, number> {
  const counts = { BEGINNER: 0, INTERMEDIATE: 0, ADVANCED: 0 } as Record<
    DifficultyLevel,
    number
  >;
  if (state.status === 'ready') {
    for (const level of DIFFICULTY_ORDER) {
      counts[level] = state.ranked.levels[level]?.tracks.length ?? 0;
    }
  }
  return counts;
}
