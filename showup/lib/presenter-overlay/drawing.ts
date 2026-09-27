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

/** Boxes and ellipses are deliberate annotations: they never fade and stay until the host removes them. */
export function isPinnedKind(kind: StrokeKind): boolean {
  return kind === "box" || kind === "ellipse";
}

/** Pinned shapes kept at once; drawing another drops the oldest. */
export const MAX_PINNED = 20;
/** Longest label a shape can carry. */
export const MAX_TEXT_LENGTH = 80;

/** A label as stored: whitespace (and newlines) collapsed, trimmed, capped; empty means no label. */
export function cleanShapeText(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_LENGTH).trim();
}

/** Kinds that are just two points, tail and latest fingertip. */
export function isRubberBand(kind: StrokeKind): boolean {
  return kind !== "free";
}

export type Stroke = {
  /** Unique within the board; how the host UI refers to a pinned shape. */
  id: number;
  kind: StrokeKind;
  /** A label shown inside a pinned box or ellipse. */
  text?: string;
  /** One of the presenter's pen colours, or (for a guest) a CSS colour. */
  color: string;
  owner: string;
  points: { x: number; y: number }[];
  /** When the stroke was finished; null while it's still being drawn. */
  endedAt: number | null;
};

/** What the host UI needs to list and remove a pinned shape. */
export type PinnedShape = { id: number; kind: "box" | "ellipse"; text: string };

export class StrokeBoard {
  private strokes: Stroke[] = [];
  private nextId = 1;
  private pinnedVersion = 0;
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
    const stroke: Stroke = { id: this.nextId++, kind, color, owner, points: [], endedAt: null };
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
  end(now: number, owner: string = HOST_OWNER): Stroke | null {
    const stroke = this.current.get(owner);
    if (!stroke) return null;
    this.current.delete(owner);
    if (isRubberBand(stroke.kind) && !isBigEnough(stroke)) {
      // A twitch, not an arrow or shape: drop it instead of leaving a dot on the screen.
      this.strokes = this.strokes.filter((other) => other !== stroke);
      return null;
    }
    stroke.endedAt = now;
    if (!isPinnedKind(stroke.kind)) return null;
    this.enforcePinnedCap();
    this.pinnedVersion++;
    return stroke;
  }

  /** Bumps whenever the set of pinned shapes or their labels changes, so the UI can tell without diffing. */
  get version(): number {
    return this.pinnedVersion;
  }

  /** The pinned shapes, oldest first. */
  pinnedShapes(): PinnedShape[] {
    return this.strokes
      .filter((stroke) => isPinnedKind(stroke.kind) && stroke.endedAt !== null)
      .map((stroke) => ({ id: stroke.id, kind: stroke.kind as "box" | "ellipse", text: stroke.text ?? "" }));
  }

  /** Sets (or, with empty text, clears) a pinned shape's label. False when there's no such shape. */
  setText(id: number, text: string): boolean {
    const stroke = this.strokes.find((other) => other.id === id && isPinnedKind(other.kind));
    if (!stroke) return false;
    const cleaned = cleanShapeText(text);
    if ((stroke.text ?? "") === cleaned) return true;
    if (cleaned) stroke.text = cleaned;
    else delete stroke.text;
    this.pinnedVersion++;
    return true;
  }

  /** Removes one pinned shape. False when there's no such shape. */
  remove(id: number): boolean {
    const index = this.strokes.findIndex((stroke) => stroke.id === id && isPinnedKind(stroke.kind) && stroke.endedAt !== null);
    if (index < 0) return false;
    this.strokes.splice(index, 1);
    this.pinnedVersion++;
    return true;
  }

  /** Removes the most recently finished pinned shape; returns its id, or null when there is none. */
  undoLast(): number | null {
    const last = this.pinnedShapes().pop();
    if (!last) return null;
    this.remove(last.id);
    return last.id;
  }

  private enforcePinnedCap() {
    const pinned = this.strokes.filter((stroke) => isPinnedKind(stroke.kind) && stroke.endedAt !== null);
    for (const stroke of pinned.slice(0, Math.max(0, pinned.length - MAX_PINNED))) {
      this.strokes.splice(this.strokes.indexOf(stroke), 1);
    }
  }

  /** Points `owner` has on the board. */
  pointsOf(owner: string): number {
    return this.strokes.reduce((total, stroke) => (stroke.owner === owner ? total + stroke.points.length : total), 0);
  }

  /** Removes everything at once, the presenter's strokes and every guest's. */
  clear() {
    if (this.strokes.some((stroke) => isPinnedKind(stroke.kind))) this.pinnedVersion++;
    this.strokes = [];
    this.current.clear();
  }

  /** Drops strokes that have faded out, then returns the rest with their opacity (1 while drawing or holding, fading to 0). */
  visible(now: number): { stroke: Stroke; alpha: number }[] {
    this.strokes = this.strokes.filter(
      (stroke) => this.isCurrent(stroke) || isPinnedKind(stroke.kind) || (stroke.endedAt !== null && now - stroke.endedAt < HOLD_MS + FADE_MS),
    );
    return this.strokes.map((stroke) => {
      if (isPinnedKind(stroke.kind)) return { stroke, alpha: 1 };
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
    while (excess > 0) {
      // Pinned shapes are never dropped to make room for freehand points (they cost two points each and are capped on their own).
      const oldest = this.strokes.find((stroke) => !isPinnedKind(stroke.kind));
      if (!oldest) break;
      if (oldest.points.length <= excess && !this.isCurrent(oldest)) {
        excess -= oldest.points.length;
        this.strokes.splice(this.strokes.indexOf(oldest), 1);
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
