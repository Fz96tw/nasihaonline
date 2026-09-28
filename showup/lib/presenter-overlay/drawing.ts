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
 * "arrow" is a straight line with a head, "box" a rectangle and "ellipse" the ellipse inscribed in it, with those two
 * points as opposite corners. "text" is a stamp (Showup's gesture-dropped text stamps): the same two-corner rubber-band
 * shape as a box, but drawn as plain text with no border — its corners are grown to fit the text, not dragged by hand.
 */
export type StrokeKind = "free" | "arrow" | "box" | "ellipse" | "text";

/** Arrows, boxes, ellipses and text stamps are deliberate annotations: they never fade and stay until the host removes them. Freehand strokes still fade. */
export function isPinnedKind(kind: StrokeKind): boolean {
  return kind === "arrow" || kind === "box" || kind === "ellipse" || kind === "text";
}

/** Boxes, ellipses and text stamps carry their text as the whole point of the mark; there is nowhere inside an arrow to put text. */
export function takesText(kind: StrokeKind): boolean {
  return kind === "box" || kind === "ellipse" || kind === "text";
}

/** Pinned marks (arrows, boxes, ellipses) kept at once; drawing another drops the oldest. */
export const MAX_PINNED = 20;
/** How far from the eraser's centre it wipes, as a fraction of the shared screen's height. */
export const ERASER_RADIUS = 0.035;
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
export type PinnedShape = { id: number; kind: "arrow" | "box" | "ellipse" | "text"; text: string };

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

  /**
   * The points of the stroke `owner` is drawing right now (not yet ended), or null if they aren't drawing.
   * For a non-pinned kind (freehand) this is the only way to read its points once `end()` is called, since
   * `end()` itself returns null for those — see `end()`'s own comment.
   */
  currentPoints(owner: string = HOST_OWNER): readonly { x: number; y: number }[] | null {
    return this.current.get(owner)?.points ?? null;
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

  /**
   * Erases every finished stroke the eraser touches, with the ring centred at (x, y) in screen-content units and
   * `radius` a fraction of the screen's height. `aspect` is the screen's width / height, so the ring is round on a wide
   * screen. Freehand strokes and arrows are hit anywhere along their line; a box or ellipse only on its outline, so
   * pointing at something inside one doesn't delete it. A stroke still being drawn is left alone. Returns how many went.
   */
  eraseAt(x: number, y: number, radius: number = ERASER_RADIUS, aspect = 1): number {
    const touched = this.strokes.filter((stroke) => !this.isCurrent(stroke) && strokeTouches(stroke, x, y, radius, aspect));
    if (touched.length === 0) return 0;
    const hadPinned = touched.some((stroke) => isPinnedKind(stroke.kind));
    this.strokes = this.strokes.filter((stroke) => !touched.includes(stroke));
    if (hadPinned) this.pinnedVersion++;
    return touched.length;
  }

  /**
   * Erases along the straight path the eraser took from `from` to `to` (or just at `to` when there is no previous
   * position), so a fast hand movement between two camera frames doesn't jump over a stroke.
   */
  eraseSwept(from: { x: number; y: number } | null, to: { x: number; y: number }, radius: number = ERASER_RADIUS, aspect = 1): number {
    if (!from) return this.eraseAt(to.x, to.y, radius, aspect);
    const length = Math.hypot((to.x - from.x) * aspect, to.y - from.y);
    const steps = Math.max(1, Math.ceil(length / (radius / 2)));
    let erased = 0;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      erased += this.eraseAt(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, radius, aspect);
    }
    return erased;
  }

  /** The pinned shapes, oldest first. */
  pinnedShapes(): PinnedShape[] {
    return this.strokes
      .filter((stroke) => isPinnedKind(stroke.kind) && stroke.endedAt !== null)
      .map((stroke) => ({ id: stroke.id, kind: stroke.kind as "arrow" | "box" | "ellipse" | "text", text: stroke.text ?? "" }));
  }

  /** Sets (or, with empty text, clears) a pinned shape's label. False when there's no such shape. */
  setText(id: number, text: string): boolean {
    const stroke = this.strokes.find((other) => other.id === id && takesText(other.kind));
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

/** Distance from (px, py) to the segment a-b, measured with x stretched by `aspect` so it is a true screen distance. */
function distanceToSegment(px: number, py: number, a: { x: number; y: number }, b: { x: number; y: number }, aspect: number): number {
  const ax = a.x * aspect;
  const bx = b.x * aspect;
  const x = px * aspect;
  const dx = bx - ax;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (py - a.y) * dy) / lengthSquared));
  return Math.hypot(x - (ax + t * dx), py - (a.y + t * dy));
}

/** Segments approximating the outline of a two-corner shape: four edges for a box, a 48-sided polygon for an ellipse. */
function outlineSegments(stroke: Stroke): [{ x: number; y: number }, { x: number; y: number }][] {
  const [a, b] = stroke.points;
  const { x, y, width, height } = shapeBounds(a, b);
  const corners = [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
  const ring =
    stroke.kind === "ellipse"
      ? Array.from({ length: 48 }, (_, i) => ({ x: x + width / 2 + (Math.cos((i / 48) * Math.PI * 2) * width) / 2, y: y + height / 2 + (Math.sin((i / 48) * Math.PI * 2) * height) / 2 }))
      : corners;
  return ring.map((point, i) => [point, ring[(i + 1) % ring.length]]);
}

function strokeTouches(stroke: Stroke, x: number, y: number, radius: number, aspect: number): boolean {
  const points = stroke.points;
  if (points.length === 0) return false;
  // A box, ellipse or text stamp is hit only on its outline (a stamp has no drawn border, but the same rectangle
  // outline is used so pointing anywhere across its middle doesn't erase it, only its edge does); freehand
  // strokes and arrows (pinned or not) are hit anywhere along their line.
  if (stroke.kind === "box" || stroke.kind === "ellipse" || stroke.kind === "text") {
    if (points.length < 2) return false;
    return outlineSegments(stroke).some(([a, b]) => distanceToSegment(x, y, a, b, aspect) <= radius);
  }
  if (points.length === 1) return Math.hypot((points[0].x - x) * aspect, points[0].y - y) <= radius;
  for (let i = 1; i < points.length; i++) {
    if (distanceToSegment(x, y, points[i - 1], points[i], aspect) <= radius) return true;
  }
  return false;
}
