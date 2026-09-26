/**
 * Zoom and pan of the shared screen layer (Showup 13): the pure, clock-free view logic.
 * Works in fractions of the captured screen (0–1); the view rectangle never leaves it.
 */

export const ZOOM = 2;
export const ZOOM_GLIDE_MS = 400;

export type ViewRect = { x: number; y: number; width: number; height: number };

type View = { size: number; ox: number; oy: number };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const smoothstep = (t: number) => t * t * (3 - 2 * t);
const FULL: View = { size: 1, ox: 0, oy: 0 };

/** Keeps a view of this size (fraction of the screen) inside the screen. */
function fit(view: View): View {
  return { size: view.size, ox: clamp(view.ox, 0, 1 - view.size), oy: clamp(view.oy, 0, 1 - view.size) };
}

export class ScreenViewport {
  private from: View = FULL;
  private to: View = FULL;
  private startedAt = 0;

  /** True while zoomed in (or zooming in). */
  get zoomed(): boolean {
    return this.to.size < 1;
  }

  /** Zooms in 2x, keeping the point (px, py — fractions of the screen) where it is under the hand/cursor. No-op if already zoomed. */
  zoomIn(now: number, px: number, py: number): boolean {
    if (this.zoomed) return false;
    const size = 1 / ZOOM;
    this.begin(now, fit({ size, ox: px - px * size, oy: py - py * size }));
    return true;
  }

  /** Back to the whole screen. */
  reset(now: number) {
    if (this.zoomed) this.begin(now, FULL);
  }

  /** Drags the view with the hand: the content follows a hand move of (dx, dy) — fractions of the screen. */
  pan(dx: number, dy: number) {
    if (!this.zoomed) return;
    // Applied to both ends so it also works while a glide is running.
    this.from = fit({ ...this.from, ox: this.from.ox - dx * this.from.size, oy: this.from.oy - dy * this.from.size });
    this.to = fit({ ...this.to, ox: this.to.ox - dx * this.to.size, oy: this.to.oy - dy * this.to.size });
  }

  /** The part of the screen to show at `now`. */
  rect(now: number): ViewRect {
    const t = clamp((now - this.startedAt) / ZOOM_GLIDE_MS, 0, 1);
    const k = smoothstep(t);
    const size = this.from.size + (this.to.size - this.from.size) * k;
    const ox = this.from.ox + (this.to.ox - this.from.ox) * k;
    const oy = this.from.oy + (this.to.oy - this.from.oy) * k;
    return { x: ox, y: oy, width: size, height: size };
  }

  private begin(now: number, to: View) {
    const current = this.rect(now);
    this.from = { size: current.width, ox: current.x, oy: current.y };
    this.to = to;
    this.startedAt = now;
  }
}
