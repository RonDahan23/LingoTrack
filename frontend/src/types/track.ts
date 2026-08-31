export type DifficultyLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';

export interface Track {
  id: string;
  title: string;
  artist: string;
  albumArtUrl: string | null;
  difficultyLevel: string; // one of DifficultyLevel, or 'UNGRADED'
  difficultyScore: number;
  lyricsSynced: boolean;
  masteredPct: number;
  previewUrl?: string | null;
  durationMs?: number | null;
}

export interface LyricLine {
  text: string;
  startTime: number; // ms
  endTime: number; // ms
  lineNumber: number;
}

/** Shape of GET /api/tracks/:trackId. */
export interface TrackDetail {
  track: Track;
  lyrics: LyricLine[];
}

/** Shape of GET /api/tracks/ranked. */
export interface RankedTracks {
  levels: Record<string, { count: number; tracks: Track[] }>;
}

/** Ordered easiest → hardest; drives the dashboard tabs. */
export const DIFFICULTY_ORDER: DifficultyLevel[] = [
  'BEGINNER',
  'INTERMEDIATE',
  'ADVANCED',
];

/**
 * Per-level presentation. Tailwind class names are written as full literals so
 * the JIT scanner keeps them (dynamically-built class strings get purged).
 */
export const DIFFICULTY_META: Record<
  DifficultyLevel,
  { label: string; text: string; badge: string; bar: string; activeTab: string }
> = {
  BEGINNER: {
    label: 'Easy Tracks',
    text: 'text-emerald-400',
    badge: 'bg-emerald-500/15 text-emerald-300',
    bar: 'bg-emerald-500',
    activeTab: 'border-emerald-400 text-emerald-300',
  },
  INTERMEDIATE: {
    label: 'Medium',
    text: 'text-amber-400',
    badge: 'bg-amber-500/15 text-amber-300',
    bar: 'bg-amber-500',
    activeTab: 'border-amber-400 text-amber-300',
  },
  ADVANCED: {
    label: 'Challenging',
    text: 'text-rose-400',
    badge: 'bg-rose-500/15 text-rose-300',
    bar: 'bg-rose-500',
    activeTab: 'border-rose-400 text-rose-300',
  },
};
