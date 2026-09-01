import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { clampToViewport, type Placement } from '../lib/popoverPosition';

/** Save state of the tapped word, so the button can reflect progress. */
export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export interface WordPopover {
  word: string;
  translation: string | null; // null while loading
  error: string | null;
  x: number; // viewport coords of the tapped word: horizontal centre,
  y: number; // and its top edge
  /** The word's bottom edge — used to flip the card below when it can't fit above. */
  anchorBottom: number;
  /** The lyric line the word came from; stored with the word for practice. */
  contextLine: string;
  save: SaveState;
}

/// A small floating card that shows a tapped word's Hebrew translation and lets
/// the learner push it into their word bank. Fixed to viewport coords;
/// dismisses on outside click, Escape, or scroll.
export function TranslationPopover({
  popover,
  onClose,
  onSave,
}: {
  popover: WordPopover;
  onClose: () => void;
  onSave: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onClose, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [onClose]);

  // Nothing to save until the translation has actually arrived.
  const canSave = popover.translation !== null && popover.save === 'idle';

  const cardRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);

  // Measure the card and keep it inside the viewport. On a phone a word near
  // either edge would otherwise be centred half off-screen, and a word on the
  // first line would sit above the top. useLayoutEffect so the corrected
  // position is committed before paint — no visible jump.
  useLayoutEffect(() => {
    const place = () => {
      const el = cardRef.current;
      if (!el) return;
      setPlacement(clampToViewport(el.getBoundingClientRect(), popover, window));
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
    // Re-measure when the content changes height (translation arrives, the save
    // button appears, an error replaces the text).
  }, [popover.x, popover.y, popover.anchorBottom, popover.translation, popover.error, popover.save]);

  return (
    <>
      {/* click-catcher */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        ref={cardRef}
        role="dialog"
        className="fixed z-50 w-44 max-w-[calc(100vw-1rem)] rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 shadow-xl"
        style={
          placement
            ? { left: placement.left, top: placement.top }
            : // First paint, before measurement: park it off-screen rather than
              // flashing at an unclamped position.
              { left: 0, top: 0, visibility: 'hidden' }
        }
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-xs text-neutral-400">{popover.word}</p>
        {popover.error ? (
          <p className="text-sm text-rose-400">{popover.error}</p>
        ) : popover.translation === null ? (
          <p className="text-sm text-neutral-500">translating…</p>
        ) : (
          <p dir="rtl" className="text-lg font-semibold text-white">
            {popover.translation}
          </p>
        )}

        {popover.translation !== null && !popover.error && (
          <button
            type="button"
            onClick={canSave ? onSave : undefined}
            disabled={!canSave}
            className={
              popover.save === 'saved'
                ? 'mt-2 w-full rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300'
                : popover.save === 'error'
                  ? 'mt-2 w-full rounded-full bg-rose-500/15 px-3 py-1 text-xs font-semibold text-rose-300'
                  : 'mt-2 w-full rounded-full bg-brand px-3 py-1 text-xs font-semibold text-black transition hover:brightness-110 disabled:opacity-60'
            }
          >
            {popover.save === 'saving'
              ? 'Saving…'
              : popover.save === 'saved'
                ? '✓ In your word bank'
                : popover.save === 'error'
                  ? 'Save failed — tap again'
                  : '+ Save to word bank'}
          </button>
        )}
      </div>
    </>
  );
}
