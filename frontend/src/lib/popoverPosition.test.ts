import { describe, it, expect } from 'vitest';
import { clampToViewport, POPOVER_GAP, POPOVER_MARGIN } from './popoverPosition';

// A narrow phone viewport, roughly iPhone SE.
const phone = { innerWidth: 375, innerHeight: 667 };
// The popover is w-44 = 176px; height varies with content.
const card = { width: 176, height: 90 };

describe('clampToViewport', () => {
  it('centres the card on the word when there is room', () => {
    const { left } = clampToViewport(card, { x: 200, y: 300, anchorBottom: 320 }, phone);
    expect(left).toBe(200 - card.width / 2); // 112
  });

  it('sits above the word by the gap when there is room', () => {
    const { top } = clampToViewport(card, { x: 200, y: 300, anchorBottom: 320 }, phone);
    expect(top).toBe(300 - card.height - POPOVER_GAP); // 202
  });

  // The reported bug: a word near the left edge was centred half off-screen.
  it('never overflows the left edge', () => {
    const { left } = clampToViewport(card, { x: 20, y: 300, anchorBottom: 320 }, phone);
    expect(left).toBe(POPOVER_MARGIN);
    expect(left).toBeGreaterThanOrEqual(0);
  });

  it('never overflows the right edge', () => {
    const { left } = clampToViewport(card, { x: 365, y: 300, anchorBottom: 320 }, phone);
    expect(left + card.width).toBeLessThanOrEqual(phone.innerWidth);
    expect(left).toBe(phone.innerWidth - card.width - POPOVER_MARGIN); // 191
  });

  it('flips below the word when there is no room above', () => {
    // Word near the top of the screen: above would be 30 - 90 - 8 = -68.
    const { top } = clampToViewport(card, { x: 200, y: 30, anchorBottom: 50 }, phone);
    expect(top).toBe(50 + POPOVER_GAP); // 58, below the word
  });

  it('never overflows the bottom edge', () => {
    const { top } = clampToViewport(
      card,
      { x: 200, y: 10, anchorBottom: 660 },
      phone,
    );
    expect(top + card.height).toBeLessThanOrEqual(phone.innerHeight);
  });

  it('keeps a tall card pinned to the top rather than pushing it off-screen', () => {
    const tall = { width: 176, height: 800 }; // taller than the viewport
    const { top } = clampToViewport(tall, { x: 200, y: 300, anchorBottom: 320 }, phone);
    expect(top).toBe(POPOVER_MARGIN);
  });

  it('keeps a card wider than the viewport pinned to the left', () => {
    const wide = { width: 400, height: 90 }; // wider than a 375px phone
    const { left } = clampToViewport(wide, { x: 200, y: 300, anchorBottom: 320 }, phone);
    expect(left).toBe(POPOVER_MARGIN);
  });

  it('stays inside the viewport for every word position across the width', () => {
    for (let x = 0; x <= phone.innerWidth; x += 5) {
      const { left } = clampToViewport(card, { x, y: 300, anchorBottom: 320 }, phone);
      expect(left).toBeGreaterThanOrEqual(0);
      expect(left + card.width).toBeLessThanOrEqual(phone.innerWidth);
    }
  });

  it('has room to spare on a desktop viewport', () => {
    const desktop = { innerWidth: 1440, innerHeight: 900 };
    const { left, top } = clampToViewport(
      card,
      { x: 700, y: 400, anchorBottom: 420 },
      desktop,
    );
    expect(left).toBe(700 - card.width / 2);
    expect(top).toBe(400 - card.height - POPOVER_GAP);
  });
});
