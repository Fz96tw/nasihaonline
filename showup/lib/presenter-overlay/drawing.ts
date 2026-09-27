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
/** The CSS colour for a stroke: the presenter's pen colour by name, or a guest's colour as given. */
export function strokeColor(color: string): string {
  return (PEN_COLORS as Record<string, string>)[color] ?? color;
}

/** Points one guest can keep on the board at once, so a guest scribbling can't push the rest off the shared cap. */
export const MAX_POINTS_PER_GUEST = 400;
/** The presenter's own strokes belong to this owner; a guest's belong to their participant id. */
export const HOST_OWNER = "host";
/** A new point closer than this (fraction of the screen) to the last one is skipped. */
const MIN_STEP = 0.002;

export type Stroke = {
  /** One of the presenter's pen colours, or (for a guest) a CSS colour. */
  color: string;
  owner: string;
  points: { x: number; y: number }[];
  /** When the stroke was finished; null while it's still being drawn. */
  endedAt: number | null;
};

export class StrokeBoard {
  private strokes: Stroke[] = [];
  /** The stroke each owner is drawing right now. */
  private current = new Map<string, Stroke>();

  /** Whether the presenter is drawing. */
  get drawing(): boolean {
    return this.current.has(HOST_OWNER);
  }

  isDrawing(owner: string = HOST_OWNER): boolean {
    return this.current.has(owner);
  }

  /** Everyone with a stroke in progress. */
  get drawingOwners(): string[] {
    return Array.from(this.current.keys());
  }

  private isCurrent(stroke: Stroke): boolean {
    return this.current.get(stroke.owner) === stroke;
  }

  get pointCount(): number {
    return this.strokes.reduce((total, stroke) => total + stroke.points.length, 0);
  }

  /** Starts a stroke for `owner` (ending any of theirs that is still going). */
  begin(now: number, color: string, owner: string = HOST_OWNER) {
    this.end(now, owner);
    const stroke: Stroke = { color, owner, points: [], endedAt: null };
    this.current.set(owner, stroke);
    this.strokes.push(stroke);
  }

  /** Adds a point (screen-content coordinates) to `owner`'s stroke being drawn. */
  add(x: number, y: number, owner: string = HOST_OWNER) {
    const stroke = this.current.get(owner);
    if (!stroke) return;
    const last = stroke.points[stroke.points.length - 1];
    if (last && Math.hypot(x - last.x, y - last.y) < MIN_STEP) return;
    stroke.points.push({ x, y });
    if (owner !== HOST_OWNER) this.enforceOwnerCap(owner);
    this.enforceCap();
  }

  /** Finishes `owner`'s stroke being drawn; it starts to fade after HOLD_MS. */
  end(now: number, owner: string = HOST_OWNER) {
    const stroke = this.current.get(owner);
    if (!stroke) return;
    stroke.endedAt = now;
    this.current.delete(owner);
  }

  /** Points `owner` has on the board. */
  pointsOf(owner: string): number {
    return this.strokes.reduce((total, stroke) => (stroke.owner === owner ? total + stroke.points.length : total), 0);
  }

  /** Removes everything at once, the presenter's strokes and every guest's. */
  clear() {
    this.strokes = [];
    this.current.clear();
  }

  /** Drops strokes that have faded out, then returns the rest with their opacity (1 while drawing or holding, fading to 0). */
  visible(now: number): { stroke: Stroke; alpha: number }[] {
    this.strokes = this.strokes.filter((stroke) => this.isCurrent(stroke) || (stroke.endedAt !== null && now - stroke.endedAt < HOLD_MS + FADE_MS));
    return this.strokes.map((stroke) => {
      const age = stroke.endedAt === null ? 0 : now - stroke.endedAt;
      return { stroke, alpha: age <= HOLD_MS ? 1 : Math.max(0, 1 - (age - HOLD_MS) / FADE_MS) };
    });
  }

  /** A guest over their own share loses their oldest points first. */
  private enforceOwnerCap(owner: string) {
    let excess = this.pointsOf(owner) - MAX_POINTS_PER_GUEST;
    for (let i = 0; excess > 0 && i < this.strokes.length; ) {
      const stroke = this.strokes[i];
      if (stroke.owner !== owner) {
        i++;
      } else if (stroke.points.length <= excess && !this.isCurrent(stroke)) {
        excess -= stroke.points.length;
        this.strokes.splice(i, 1);
      } else {
        const trimmed = Math.min(excess, stroke.points.length);
        stroke.points.splice(0, trimmed);
        excess -= trimmed;
        i++;
      }
    }
  }

  private enforceCap() {
    let excess = this.pointCount - MAX_POINTS;
    while (excess > 0 && this.strokes.length > 0) {
      const oldest = this.strokes[0];
      if (oldest.points.length <= excess && !this.isCurrent(oldest)) {
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
