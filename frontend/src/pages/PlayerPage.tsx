import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchTrack, prepareTrack } from '../api/tracks';
import { translateToHebrew } from '../api/translate';
import { captureWord } from '../api/wordBank';
import { AppHeader } from '../components/AppHeader';
import { ErrorState } from '../components/ErrorState';
import { Spinner } from '../components/Spinner';
import { LyricLineRow, type LineTranslation } from '../components/LyricLineRow';
import { TranslationPopover, type WordPopover } from '../components/TranslationPopover';
import { useSpotifyPlayer } from '../hooks/useSpotifyPlayer';
import { ApiError } from '../lib/apiClient';
import { findActiveLineIndex, formatTimestamp } from '../lib/lyricSync';
import { DIFFICULTY_META, type DifficultyLevel, type TrackDetail } from '../types/track';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; detail: TrackDetail }
  | { status: 'error'; message: string };

export function PlayerPage() {
  const { trackId = '' } = useParams();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      setState({ status: 'ready', detail: await fetchTrack(trackId) });
    } catch (err) {
      setState({ status: 'error', message: err instanceof ApiError ? err.message : 'Failed to load track' });
    }
  }, [trackId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="min-h-dvh">
      <AppHeader
        title={state.status === 'ready' ? state.detail.track.title : 'Player'}
        leading={
          <Link to="/" aria-label="Back" className="-ml-2 rounded-full p-2 text-neutral-300 hover:bg-neutral-800 hover:text-white">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        }
      />
      <main className="mx-auto max-w-3xl px-4 pb-28 pt-4">
        {state.status === 'loading' && <Spinner label="Loading track…" />}
        {state.status === 'error' && <ErrorState message={state.message} onRetry={load} />}
        {state.status === 'ready' && <SyncPlayer detail={state.detail} onReload={load} />}
      </main>
    </div>
  );
}

function SyncPlayer({ detail, onReload }: { detail: TrackDetail; onReload: () => void }) {
  const { track, lyrics } = detail;
  const player = useSpotifyPlayer();

  const [started, setStarted] = useState(false);
  const [manualPos, setManualPos] = useState(0);
  const [preparing, setPreparing] = useState(false);
  const [prepareNote, setPrepareNote] = useState<string | null>(null);

  const [popover, setPopover] = useState<WordPopover | null>(null);
  const [lineTx, setLineTx] = useState<{ index: number } & LineTranslation | null>(null);
  const resumeAfterTx = useRef(false);

  const lineRefs = useRef<(HTMLLIElement | null)[]>([]);

  const prepared = lyrics.length > 0;
  const positionMs = started ? player.positionMs : manualPos;
  const activeIndex = findActiveLineIndex(lyrics, positionMs);

  useEffect(() => {
    if (activeIndex >= 0) {
      lineRefs.current[activeIndex]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeIndex]);

  const onPrepare = useCallback(async () => {
    setPreparing(true);
    setPrepareNote(null);
    try {
      const result = await prepareTrack(track.id);
      if (result.prepared) onReload();
      else setPrepareNote('No synced lyrics were found for this track on LRCLIB.');
    } catch (err) {
      setPrepareNote(err instanceof ApiError ? err.message : 'Preparation failed');
    } finally {
      setPreparing(false);
    }
  }, [track.id, onReload]);

  const onStart = useCallback(async () => {
    try {
      await player.playTrack(track.id);
      setStarted(true);
    } catch (err) {
      setPrepareNote(err instanceof Error ? err.message : 'Could not start playback');
    }
  }, [player, track.id]);

  const onWordTap = useCallback(async (word: string, anchor: DOMRect, contextLine: string) => {
    if (!word) return;
    setPopover({
      word,
      translation: null,
      error: null,
      x: anchor.left + anchor.width / 2,
      y: anchor.top,
      anchorBottom: anchor.bottom,
      contextLine,
      save: 'idle',
    });
    try {
      const translation = await translateToHebrew(word);
      // Guard against a stale response for a word the learner already moved off.
      setPopover((p) => (p && p.word === word ? { ...p, translation } : p));
    } catch {
      setPopover((p) => (p ? { ...p, error: 'Translation failed' } : p));
    }
  }, []);

  /**
   * Pushes the tapped word into the word bank. The translation already on
   * screen rides along as a fallback, so a flaky translation service can't
   * block a save the learner can plainly see the answer for.
   */
  const onSaveWord = useCallback(async () => {
    const current = popover;
    if (!current || current.translation === null) return;

    setPopover((p) => (p && p.word === current.word ? { ...p, save: 'saving' } : p));
    try {
      await captureWord({
        word: current.word,
        contextLine: current.contextLine,
        trackId: track.id,
        translation: current.translation,
      });
      setPopover((p) => (p && p.word === current.word ? { ...p, save: 'saved' } : p));
    } catch {
      setPopover((p) => (p && p.word === current.word ? { ...p, save: 'error' } : p));
    }
  }, [popover, track.id]);

  const onTranslateLine = useCallback(
    async (index: number, text: string) => {
      resumeAfterTx.current = player.isPlaying;
      if (player.isPlaying) await player.pause();
      setLineTx({ index, text: null, error: null });
      try {
        const translation = await translateToHebrew(text);
        setLineTx((cur) => (cur && cur.index === index ? { ...cur, text: translation } : cur));
      } catch {
        setLineTx((cur) => (cur ? { ...cur, error: 'Translation failed' } : cur));
      }
    },
    [player],
  );

  const onResumeLine = useCallback(() => {
    setLineTx(null);
    if (resumeAfterTx.current) void player.resume();
  }, [player]);

  const onSeekLine = useCallback(
    (startTime: number) => {
      if (started) void player.seek(startTime);
      else setManualPos(startTime);
    },
    [player, started],
  );

  return (
    <div>
      <TrackMeta track={track} />

      <PlayerControls
        prepared={prepared}
        started={started}
        preparing={preparing}
        player={player}
        note={prepareNote}
        positionMs={positionMs}
        onPrepare={onPrepare}
        onStart={onStart}
      />

      {!prepared ? (
        <p className="py-10 text-center text-neutral-400">
          {preparing ? 'Fetching lyrics…' : 'Prepare this track to fetch its synced lyrics.'}
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-0.5">
          {lyrics.map((line, i) => (
            <li key={line.lineNumber} ref={(el) => { lineRefs.current[i] = el; }}>
              <LyricLineRow
                line={line}
                isActive={i === activeIndex}
                onWordTap={onWordTap}
                onTranslate={() => onTranslateLine(i, line.text)}
                translation={lineTx?.index === i ? lineTx : null}
                onResume={onResumeLine}
                onSeek={() => onSeekLine(line.startTime)}
              />
            </li>
          ))}
        </ul>
      )}

      {popover && (
        <TranslationPopover
          popover={popover}
          onClose={() => setPopover(null)}
          onSave={onSaveWord}
        />
      )}
    </div>
  );
}

function TrackMeta({ track }: { track: TrackDetail['track'] }) {
  const meta = DIFFICULTY_META[track.difficultyLevel as DifficultyLevel] ?? null;
  return (
    <div className="mb-4 flex items-center gap-4">
      {track.albumArtUrl ? (
        <img src={track.albumArtUrl} alt="" className="h-20 w-20 rounded-xl object-cover" />
      ) : (
        <div className="h-20 w-20 rounded-xl bg-neutral-800" />
      )}
      <div className="min-w-0">
        <p className="truncate text-lg font-semibold text-white">{track.title}</p>
        <p className="truncate text-neutral-400">{track.artist}</p>
        {meta && (
          <span className={`mt-1 inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${meta.badge}`}>
            {meta.label} · {track.difficultyScore.toFixed(1)}
          </span>
        )}
      </div>
    </div>
  );
}

function PlayerControls({
  prepared,
  started,
  preparing,
  player,
  note,
  positionMs,
  onPrepare,
  onStart,
}: {
  prepared: boolean;
  started: boolean;
  preparing: boolean;
  player: ReturnType<typeof useSpotifyPlayer>;
  note: string | null;
  positionMs: number;
  onPrepare: () => void;
  onStart: () => void;
}) {
  return (
    <div className="rounded-xl bg-surface-raised p-3">
      {!prepared ? (
        <button
          type="button"
          disabled={preparing}
          onClick={onPrepare}
          className="w-full rounded-full bg-brand px-5 py-2.5 font-semibold text-black transition hover:brightness-110 disabled:opacity-60"
        >
          {preparing ? 'Preparing…' : 'Prepare this track'}
        </button>
      ) : !started ? (
        <button
          type="button"
          disabled={player.status !== 'ready'}
          onClick={onStart}
          className="w-full rounded-full bg-brand px-5 py-2.5 font-semibold text-black transition hover:brightness-110 disabled:opacity-60"
        >
          {player.status === 'loading' ? 'Connecting to Spotify…' : 'Start — play full song'}
        </button>
      ) : (
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label={player.isPlaying ? 'Pause' : 'Play'}
            onClick={() => (player.isPlaying ? void player.pause() : void player.resume())}
            className="rounded-full bg-brand p-2.5 text-black hover:brightness-110"
          >
            {player.isPlaying ? (
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5"><path d="M6 4h4v16H6zM14 4h4v16h-4z" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5"><path d="M6 4l14 8-14 8V4z" /></svg>
            )}
          </button>
          <span className="text-sm tabular-nums text-neutral-400">
            {formatTimestamp(positionMs)}
            {player.durationMs > 0 && ` / ${formatTimestamp(player.durationMs)}`}
          </span>
          <VolumeControl volume={player.volume} onChange={(v) => void player.setVolume(v)} />
        </div>
      )}

      {player.error && <p className="mt-2 text-sm text-amber-400">{player.error}</p>}
      {note && <p className="mt-2 text-sm text-rose-400">{note}</p>}
    </div>
  );
}

function VolumeControl({
  volume,
  onChange,
}: {
  volume: number;
  onChange: (volume: number) => void;
}) {
  const muted = volume === 0;
  return (
    <div className="ml-auto flex items-center gap-2">
      <button
        type="button"
        aria-label={muted ? 'Unmute' : 'Mute'}
        title={muted ? 'Unmute' : 'Mute'}
        onClick={() => onChange(muted ? 0.8 : 0)}
        className="text-neutral-400 transition hover:text-white"
      >
        <VolumeIcon level={volume} />
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={volume}
        aria-label="Volume"
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 w-24 cursor-pointer accent-brand"
      />
    </div>
  );
}

function VolumeIcon({ level }: { level: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
      <path d="M4 9v6h4l5 4V5L8 9H4z" strokeLinejoin="round" />
      {level === 0 ? (
        <path d="M22 9l-6 6M16 9l6 6" strokeLinecap="round" />
      ) : (
        <>
          <path d="M16 8.5a5 5 0 0 1 0 7" strokeLinecap="round" />
          {level > 0.5 && <path d="M18.5 6a8 8 0 0 1 0 12" strokeLinecap="round" />}
        </>
      )}
    </svg>
  );
}
