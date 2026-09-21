import { useEffect, useRef, useState } from "react";

/** True when the OS asks for reduced motion. Client-only (returns false during SSR). */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Tween an integer from `from` to `to` over `durationMs` with an ease-out
 * curve, calling `onFrame` each animation frame. Under reduced motion (or when
 * there is nothing to animate) it jumps straight to `to`. Returns a cancel fn.
 */
export function animateNumber(
  from: number,
  to: number,
  durationMs: number,
  onFrame: (value: number) => void,
): () => void {
  if (from === to || prefersReducedMotion()) {
    onFrame(to);
    return () => {};
  }

  const start = performance.now();
  let frame = 0;
  const tick = (now: number) => {
    const progress = Math.min(1, (now - start) / durationMs);
    onFrame(Math.round(from + (to - from) * easeOutCubic(progress)));
    if (progress < 1) frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}

/**
 * Counts up to `target` on mount and re-tweens from the last shown value when
 * `target` changes. Shows the final value immediately under reduced motion.
 */
export function useCountUp(target: number, durationMs = 800): number {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? target : 0));
  const shown = useRef(value);

  useEffect(
    () =>
      animateNumber(shown.current, target, durationMs, (next) => {
        shown.current = next;
        setValue(next);
      }),
    [target, durationMs],
  );

  return value;
}
