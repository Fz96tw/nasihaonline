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
/** An arrow shorter than this (in screen-content units, where 1 is the whole screen) is thrown away when it is finished: a twitch, not an arrow. */
export const MIN_ARROW_LENGTH = 0.03;
/** A box or ellipse narrower or shorter than this (in screen-content units) is thrown away when it is finished: it would be a line, not a shape. */
export const MIN_SHAPE_SIZE = 0.02;

/**
 * "free" follows the fingertip. The others keep only where the pen started and where it is now (a rubber band):
 * "arrow" is a straight line with a head, "box" a rectangle and "ellipse" the ellipse inscribed in it, with those two points as opposite corners.
 */
export type StrokeKind = "free" | "arrow" | "box" | "ellipse";

/** Kinds that are just two points, tail and latest fingertip. */
export function isRubberBand(kind: StrokeKind): boolean {
  return kind !== "free";
}

export type Stroke = {
  kind: StrokeKind;
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

  /** What `owner` is drawing right now, or null when they aren't drawing. */
  kindOf(owner: string = HOST_OWNER): StrokeKind | null {
    return this.current.get(owner)?.kind ?? null;
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
  begin(now: number, color: string, owner: string = HOST_OWNER, kind: StrokeKind = "free") {
    this.end(now, owner);
    const stroke: Stroke = { kind, color, owner, points: [], endedAt: null };
    this.current.set(owner, stroke);
    this.strokes.push(stroke);
  }

  /** Adds a point (screen-content coordinates) to `owner`'s stroke being drawn. */
  add(x: number, y: number, owner: string = HOST_OWNER) {
    const stroke = this.current.get(owner);
    if (!stroke) return;
    if (isRubberBand(stroke.kind)) {
      // Rubber band: the first point is the tail, the second follows the fingertip.
      if (stroke.points.length === 0) stroke.points.push({ x, y });
      else stroke.points[1] = { x, y };
      return;
    }
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
    this.current.delete(owner);
    if (isRubberBand(stroke.kind) && !isBigEnough(stroke)) {
      // A twitch, not an arrow or shape: drop it instead of leaving a dot on the screen.
      this.strokes = this.strokes.filter((other) => other !== stroke);
      return;
    }
    stroke.endedAt = now;
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

function isBigEnough({ kind, points }: Stroke): boolean {
  if (points.length < 2) return false;
  if (kind === "arrow") return Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y) >= MIN_ARROW_LENGTH;
  return Math.abs(points[1].x - points[0].x) >= MIN_SHAPE_SIZE && Math.abs(points[1].y - points[0].y) >= MIN_SHAPE_SIZE;
}

/** The axis-aligned rectangle with these two points as opposite corners (whichever way the pen was dragged). */
export function shapeBounds(a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number; width: number; height: number } {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
}

/**
 * The two barbs of an arrowhead at `to`, for an arrow from `from`. Works in whatever unit the points are in;
 * pass `aspect` (width / height of the space they are drawn in) so a head on a diagonal isn't squashed when
 * the points are fractions of a non-square screen. `size` is the barb length in the same unit as the y axis.
 */
export function arrowHead(
  from: { x: number; y: number },
  to: { x: number; y: number },
  size: number,
  aspect = 1,
): [{ x: number; y: number }, { x: number; y: number }] {
  // Work in isotropic space (x scaled by aspect) so angles are true, then scale back.
  const dx = (to.x - from.x) * aspect;
  const dy = to.y - from.y;
  const angle = Math.atan2(dy, dx);
  const spread = Math.PI / 7;
  const barb = (offset: number) => ({
    x: to.x - (Math.cos(angle + offset) * size) / aspect,
    y: to.y - Math.sin(angle + offset) * size,
  });
  return [barb(spread), barb(-spread)];
}
