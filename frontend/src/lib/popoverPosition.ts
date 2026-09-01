/**
 * Pure viewport-clamping for the word-translation popover.
 *
 * The card is centred on the tapped word and prefers to sit above it, but on a
 * phone that naive placement pushes it off-screen: a word near the left or
 * right edge gets a card centred half outside the viewport, and a word on the
 * first visible lyric line gets one above the top. This clamps both axes and
 * flips the card below the word when there is no room above.
 *
 * Kept out of the component because the frontend's Vitest setup is
 * `environment: 'node'` with no jsdom — geometry this fiddly is worth testing.
 */

/** Gap between the word and the card, and the minimum edge inset. */
export const POPOVER_GAP = 8;
export const POPOVER_MARGIN = 8;

export interface Placement {
  left: number;
  top: number;
}

export interface CardSize {
  width: number;
  height: number;
}

export interface AnchorPoint {
  /** Horizontal centre of the tapped word, in viewport coords. */
  x: number;
  /** Top edge of the tapped word. */
  y: number;
  /** Bottom edge of the tapped word. */
  anchorBottom: number;
}

export interface ViewportSize {
  innerWidth: number;
  innerHeight: number;
}

/** Clamp `value` into [min, max], tolerating an inverted range. */
function clamp(value: number, min: number, max: number): number {
  // When the card is wider/taller than the viewport the range inverts; pinning
  // to `min` keeps the top-left corner visible rather than the bottom-right.
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

export function clampToViewport(
  card: CardSize,
  anchor: AnchorPoint,
  viewport: ViewportSize,
  margin: number = POPOVER_MARGIN,
): Placement {
  const left = clamp(
    anchor.x - card.width / 2,
    margin,
    viewport.innerWidth - card.width - margin,
  );

  // Prefer above the word; flip below when it would clear the top edge.
  const above = anchor.y - card.height - POPOVER_GAP;
  const preferred = above >= margin ? above : anchor.anchorBottom + POPOVER_GAP;

  const top = clamp(
    preferred,
    margin,
    viewport.innerHeight - card.height - margin,
  );

  return { left, top };
}
