"use client";

import { useEffect, useRef } from "react";

// Accumulated scroll distance (not per-event delta — a single scroll event
// can fire with a tiny delta many times) needed in one direction before
// flipping revealed state.
const REVEAL_DELTA = 32;
const HIDE_DELTA = 32;
// Chromium (and real trackpads/momentum scrolling) apply their own
// deceleration easing to a scroll, independent of any CSS scroll-behavior —
// a large scroll settles over several more frames, often drifting a couple
// dozen px in the OPPOSITE direction as it decelerates. Without a cooldown,
// that settle-wobble alone is enough to immediately re-trigger the opposite
// flip right after a real one (confirmed: a single 1500px programmatic
// scroll produced a ~29px reverse drift over the next ~10 events). This
// blocks another flip for a short window after each one, long enough to
// absorb that settle tail but short enough that a genuinely new scroll
// gesture afterward still feels responsive.
const FLIP_COOLDOWN_MS = 200;

/**
 * Scroll-direction-driven reveal/hide for a sticky header row: revealed at
 * the top of the page and on scroll up, hidden on scroll down, from anywhere
 * on the page. Shared by HeaderSearchRow and the live-events strip so both
 * behave identically.
 *
 * `apply(revealed)` runs once on mount and on every scroll event (callers set
 * a CSS var / state from it). While `enabled` is false no listener is
 * attached and `apply` isn't called; re-enabling restarts fresh (revealed,
 * as at initial load).
 */
export function useScrollReveal(apply: (revealed: boolean) => void, enabled = true): void {
  const applyRef = useRef(apply);
  applyRef.current = apply;

  useEffect(() => {
    if (!enabled) return;

    let revealed = true;
    let lastY = window.scrollY;
    let accum = 0;
    let lastFlipAt = 0;

    const handleScroll = () => {
      const y = window.scrollY;
      const diff = y - lastY;
      lastY = y;

      if (y <= 0) {
        revealed = true;
        accum = 0;
      } else if (Date.now() - lastFlipAt < FLIP_COOLDOWN_MS) {
        // Still settling from the last flip — don't accumulate at all, or a
        // deceleration-tail wobble in the opposite direction immediately
        // undoes what the user just triggered.
      } else {
        // Direction flipped — restart the accumulator toward the new direction.
        if ((diff < 0 && accum > 0) || (diff > 0 && accum < 0)) accum = 0;
        accum += diff;
        if (!revealed && accum <= -REVEAL_DELTA) {
          revealed = true;
          accum = 0;
          lastFlipAt = Date.now();
        } else if (revealed && accum >= HIDE_DELTA) {
          revealed = false;
          accum = 0;
          lastFlipAt = Date.now();
        }
      }
      applyRef.current(revealed);
    };

    applyRef.current(revealed);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [enabled]);
}
