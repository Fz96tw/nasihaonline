/**
 * Air-draw strokes (Showup 18): the pure, clock-free stroke store.
 * Strokes live in screen-content coordinates (fractions of the captured screen), so zooming or panning keeps
 * a circle around the thing it circles. Finished strokes hold for a moment, then fade out; the total number
 * of points is capped so memory stays bounded. Time is passed in.
 */

export type PenColor = "red" | "yellow" | "green";
export const PEN_COLORS: Record<PenColor, string> = { red: "#ff3030", yellow: "#ffd60a", green: "#30d158" };

/** A finished stroke stays fully visible this long, then fades over FADE_MS (about 3 s in all). */
export const HOLD_MS = 2000;
export const FADE_MS = 1000;
/** Total points kept across all strokes; the oldest go first. */
export const MAX_POINTS = 2000;
/** A new point closer than this (fraction of the screen) to the last one is skipped. */
const MIN_STEP = 0.002;

export type Stroke = {
  color: PenColor;
  points: { x: number; y: number }[];
  /** When the stroke was finished; null while it's still being drawn. */
  endedAt: number | null;
};

export class StrokeBoard {
  private strokes: Stroke[] = [];
  private current: Stroke | null = null;

  get drawing(): boolean {
    return this.current !== null;
  }

  get pointCount(): number {
    return this.strokes.reduce((total, stroke) => total + stroke.points.length, 0);
  }

  /** Starts a stroke (ending any that is still going). */
  begin(now: number, color: PenColor) {
    this.end(now);
    this.current = { color, points: [], endedAt: null };
    this.strokes.push(this.current);
  }

  /** Adds a point (screen-content coordinates) to the stroke being drawn. */
  add(x: number, y: number) {
    const stroke = this.current;
    if (!stroke) return;
    const last = stroke.points[stroke.points.length - 1];
    if (last && Math.hypot(x - last.x, y - last.y) < MIN_STEP) return;
    stroke.points.push({ x, y });
    this.enforceCap();
  }

  /** Finishes the stroke being drawn; it starts to fade after HOLD_MS. */
  end(now: number) {
    if (!this.current) return;
    this.current.endedAt = now;
    this.current = null;
  }

  /** Removes everything at once. */
  clear() {
    this.strokes = [];
    this.current = null;
  }

  /** Drops strokes that have faded out, then returns the rest with their opacity (1 while drawing or holding, fading to 0). */
  visible(now: number): { stroke: Stroke; alpha: number }[] {
    this.strokes = this.strokes.filter((stroke) => stroke === this.current || (stroke.endedAt !== null && now - stroke.endedAt < HOLD_MS + FADE_MS));
    return this.strokes.map((stroke) => {
      const age = stroke.endedAt === null ? 0 : now - stroke.endedAt;
      return { stroke, alpha: age <= HOLD_MS ? 1 : Math.max(0, 1 - (age - HOLD_MS) / FADE_MS) };
    });
  }

  private enforceCap() {
    let excess = this.pointCount - MAX_POINTS;
    while (excess > 0 && this.strokes.length > 0) {
      const oldest = this.strokes[0];
      if (oldest.points.length <= excess && oldest !== this.current) {
        excess -= oldest.points.length;
        this.strokes.shift();
      } else {
        // The only stroke left over the cap (a very long one): trim its oldest points.
        oldest.points.splice(0, Math.min(excess, oldest.points.length));
        excess = 0;
      }
    }
  }
}
