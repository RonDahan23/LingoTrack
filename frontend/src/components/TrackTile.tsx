import { Link } from 'react-router-dom';
import { DIFFICULTY_META, type DifficultyLevel, type Track } from '../types/track';

/// One row in a difficulty list. The whole row links to the sync player.
export function TrackTile({ track }: { track: Track }) {
  const meta = DIFFICULTY_META[track.difficultyLevel as DifficultyLevel] ?? null;

  return (
    <Link
      to={`/player/${encodeURIComponent(track.id)}`}
      className="flex items-center gap-3 rounded-xl bg-surface-raised p-3 transition hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      <AlbumArt url={track.albumArtUrl} />

      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-white">{track.title}</p>
        <p className="truncate text-sm text-neutral-400">{track.artist}</p>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-neutral-700">
          <div
            className={`h-full ${meta?.bar ?? 'bg-neutral-500'}`}
            style={{ width: `${Math.round(clamp01(track.masteredPct) * 100)}%` }}
          />
        </div>
      </div>

      <span
        className={`shrink-0 rounded-lg px-2.5 py-1 text-sm font-semibold tabular-nums ${
          meta?.badge ?? 'bg-neutral-700 text-neutral-200'
        }`}
      >
        {track.difficultyScore.toFixed(1)}
      </span>
    </Link>
  );
}

function AlbumArt({ url }: { url: string | null }) {
  if (!url) {
    return (
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-neutral-800 text-neutral-500">
        <MusicIcon />
      </div>
    );
  }
  return (
    <img
      src={url}
      alt=""
      className="h-14 w-14 shrink-0 rounded-lg object-cover"
      loading="lazy"
    />
  );
}

function MusicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6" aria-hidden="true">
      <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" />
    </svg>
  );
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
