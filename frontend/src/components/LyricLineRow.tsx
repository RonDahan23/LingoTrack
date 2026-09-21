import { findPhraseAt, type PhraseMatch } from '../lib/phrases';
import { rareTokenIndices } from '../lib/rareWords';
import { cleanWord, tokenizeLine } from '../lib/wordTokenize';
import type { LyricLine } from '../types/track';

export interface LineTranslation {
  text: string | null; // null while loading
  error: string | null;
}

interface LyricLineRowProps {
  line: LyricLine;
  isActive: boolean;
  /**
   * `contextLine` is the lyric the word came from — saved with it for practice,
   * and used server-side to pick the right dictionary sense. `phrase` is the
   * multi-word expression the tap landed inside, when there is one.
   */
  onWordTap: (
    word: string,
    /** The tapped element itself, so the card can follow it as lyrics scroll. */
    anchorEl: HTMLElement,
    contextLine: string,
    phrase: PhraseMatch | null,
  ) => void;
  onTranslate: () => void;
  /** Present when this line's full translation is open (playback paused). */
  translation?: LineTranslation | null;
  onResume: () => void;
  /** Tap the line body to seek playback here. */
  onSeek: () => void;
  /**
   * Token span to show as selected — the whole phrase when a tap resolved to
   * one, so the learner sees what was actually looked up.
   */
  selection?: { start: number; end: number } | null;
  /** Library-wide unfamiliar words, marked so they can be noticed unprompted. */
  vocabulary?: ReadonlySet<string>;
}

export function LyricLineRow({
  line,
  isActive,
  onWordTap,
  onTranslate,
  translation,
  onResume,
  onSeek,
  selection,
  vocabulary,
}: LyricLineRowProps) {
  const tokens = tokenizeLine(line.text);
  // Underline, not a background tint: the row already uses background for the
  // active line and for a selected phrase, and a third would collide with both.
  const rare = rareTokenIndices(tokens, vocabulary ?? EMPTY);

  return (
    <div
      className={`rounded-lg px-2 py-1.5 transition ${
        isActive ? 'bg-brand/15' : ''
      }`}
    >
      <div className="flex items-start gap-2">
        <p
          className={`flex-1 text-lg leading-relaxed ${
            isActive ? 'font-semibold text-white' : 'text-neutral-400'
          }`}
        >
          {tokens.map((token, i) =>
            token.isWord ? (
              <button
                key={i}
                type="button"
                onClick={(e) =>
                  onWordTap(
                    cleanWord(token.text),
                    e.currentTarget,
                    line.text,
                    findPhraseAt(tokens, i),
                  )
                }
                className={`rounded px-0.5 focus:outline-none focus-visible:bg-white/10 ${
                  selection && i >= selection.start && i < selection.end
                    ? 'bg-brand/30 text-white'
                    : 'hover:bg-white/10 hover:text-white'
                } ${
                  rare.has(i)
                    ? 'underline decoration-amber-400/70 decoration-dotted decoration-2 underline-offset-4'
                    : ''
                }`}
              >
                {token.text}
              </button>
            ) : (
              <span
                key={i}
                className={
                  selection && i > selection.start && i < selection.end ? 'bg-brand/30' : ''
                }
              >
                {token.text}
              </span>
            ),
          )}
        </p>

        <div className="flex shrink-0 items-center gap-1">
          <IconButton label="Jump here" onClick={onSeek}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path d="M5 3l14 9-14 9V3z" strokeLinejoin="round" />
            </svg>
          </IconButton>
          <IconButton label="Translate line" onClick={onTranslate}>
            {/* language / translate glyph */}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path d="M4 5h7M9 3v2c0 4-2 7-5 8m1-4c0 3 2 5 5 6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M14 20l4-9 4 9m-7-2h6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </IconButton>
        </div>
      </div>

      {translation && (
        <div className="mt-1 rounded-md bg-neutral-800/70 px-3 py-2">
          {translation.error ? (
            <p className="text-sm text-rose-400">{translation.error}</p>
          ) : translation.text === null ? (
            <p className="text-sm text-neutral-500">translating…</p>
          ) : (
            <p dir="rtl" className="text-base text-emerald-200">
              {translation.text}
            </p>
          )}
          <button
            type="button"
            onClick={onResume}
            className="mt-2 rounded-full bg-brand px-3 py-1 text-sm font-semibold text-black hover:brightness-110"
          >
            Resume
          </button>
        </div>
      )}
    </div>
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
      className="rounded-full p-1.5 text-neutral-400 transition hover:bg-neutral-700 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      {children}
    </button>
  );
}

/** Stable empty set, so a row without vocabulary does not allocate per render. */
const EMPTY: ReadonlySet<string> = new Set();
