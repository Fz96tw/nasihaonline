/**
 * "Keep background" panel for the host's own ghost: the pure, clock-free logic.
 * Where the crop window goes on the camera frame (per shape, centred on the person, clamped to the frame,
 * smoothed so it doesn't jitter) and the shape outlines. The compositor does the drawing.
 */

export type PanelShape = "rounded" | "circle" | "arch";

export const PANEL_SHAPES: readonly PanelShape[] = ["rounded", "circle", "arch"];

/** Rounded rectangle and arch are portrait windows of this width / height. */
const PORTRAIT_ASPECT = 3 / 4;
/** The circle's side as a fraction of the camera's shorter side: zoomed in on head and shoulders, not the torso. */
const CIRCLE_ZOOM = 0.55;
/** Where the top of the head sits in the circle, as a fraction of its side. */
const CIRCLE_HEAD_TOP = 0.15;

/** Width / height of the panel drawn for a shape. */
export function panelAspect(shape: PanelShape): number {
  return shape === "circle" ? 1 : PORTRAIT_ASPECT;
}

export type Rect = { x: number; y: number; width: number; height: number };

/** Crop-window size, in camera pixels, for a shape. Never larger than the camera frame. */
export function windowSize(shape: PanelShape, cameraWidth: number, cameraHeight: number): { width: number; height: number } {
  if (shape === "circle") {
    const side = Math.min(cameraWidth, cameraHeight) * CIRCLE_ZOOM;
    return { width: side, height: side };
  }
  // Full camera height (head plus upper body), narrowed to the portrait shape; a camera narrower than that keeps its width.
  const height = Math.min(cameraHeight, cameraWidth / PORTRAIT_ASPECT);
  return { width: height * PORTRAIT_ASPECT, height };
}

/** Puts a window of the given size with its centre at (cx, cy), moved as needed so it never leaves the camera frame. */
export function clampWindow(cx: number, cy: number, width: number, height: number, cameraWidth: number, cameraHeight: number): Rect {
  const w = Math.min(width, cameraWidth);
  const h = Math.min(height, cameraHeight);
  return {
    x: Math.min(Math.max(cx - w / 2, 0), cameraWidth - w),
    y: Math.min(Math.max(cy - h / 2, 0), cameraHeight - h),
    width: w,
    height: h,
  };
}

/** The person's extent in the frame, as fractions 0–1 of its width and height. */
export type PersonBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  /** Horizontal centre of the upper part of the person — the head, not an outstretched arm. */
  headX: number;
};

/** Below this share of sampled pixels the mask is noise, not a person. */
const MIN_PERSON_FRACTION = 0.01;
/** The top part of the person that counts as "the head" when finding its centre. */
const HEAD_BAND = 0.25;

/**
 * Finds the person in a segmentation confidence mask (row-major, 0–1 per pixel). `single` is true when the
 * model has one "person" channel; false when the values are background confidence. Samples every `stride`th
 * pixel. Returns null when nobody is there.
 */
export function personBounds(confidence: ArrayLike<number>, width: number, height: number, single = true, stride = 4): PersonBounds | null {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let hits = 0;
  let samples = 0;
  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      samples++;
      const person = single ? confidence[y * width + x] : 1 - confidence[y * width + x];
      if (person < 0.5) continue;
      hits++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (samples === 0 || hits / samples < MIN_PERSON_FRACTION) return null;
  const headBottom = minY + (maxY - minY) * HEAD_BAND;
  let headSum = 0;
  let headCount = 0;
  for (let y = minY; y <= headBottom; y += stride) {
    for (let x = minX; x <= maxX; x += stride) {
      const person = single ? confidence[y * width + x] : 1 - confidence[y * width + x];
      if (person < 0.5) continue;
      headSum += x;
      headCount++;
    }
  }
  const headX = headCount > 0 ? headSum / headCount : (minX + maxX) / 2;
  return { left: minX / width, right: maxX / width, top: minY / height, bottom: maxY / height, headX: headX / width };
}

/**
 * Where the window's centre should be, in camera pixels. Portrait shapes follow the person's horizontal
 * position (they already span the full height). The circle follows the head, placing its top near the top
 * of the circle. With nobody detected, the frame's centre.
 */
export function targetCentre(shape: PanelShape, person: PersonBounds | null, cameraWidth: number, cameraHeight: number): { x: number; y: number } {
  if (!person) return { x: cameraWidth / 2, y: cameraHeight / 2 };
  if (shape === "circle") {
    const side = windowSize(shape, cameraWidth, cameraHeight).height;
    return { x: person.headX * cameraWidth, y: person.top * cameraHeight + side * (0.5 - CIRCLE_HEAD_TOP) };
  }
  return { x: ((person.left + person.right) / 2) * cameraWidth, y: cameraHeight / 2 };
}

/** Movements smaller than this fraction of the camera width are ignored. */
export const DEADZONE = 0.04;
/** A larger shift must last this long before the window follows it. */
export const DWELL_MS = 400;
/** Time constant of the glide once it follows. */
export const GLIDE_MS = 250;

/**
 * Smooths the window's centre, in the settle/dwell style of speaker-follow: small movements are ignored,
 * a larger shift is followed only once it has lasted DWELL_MS, then the window glides there. Clock-free —
 * the caller passes the time.
 */
export class WindowSmoother {
  private cx: number;
  private cy: number;
  private shiftedSince: number | null = null;
  private gliding = false;
  private last: number | null = null;

  constructor(x: number, y: number) {
    this.cx = x;
    this.cy = y;
  }

  get centre(): { x: number; y: number } {
    return { x: this.cx, y: this.cy };
  }

  /** Feeds the latest target (camera pixels) at time `now` (ms); returns the smoothed centre. */
  update(now: number, targetX: number, targetY: number, cameraWidth: number): { x: number; y: number } {
    const dt = this.last === null ? 0 : Math.max(0, now - this.last);
    this.last = now;
    const dead = DEADZONE * cameraWidth;
    const off = Math.hypot(targetX - this.cx, targetY - this.cy);
    if (!this.gliding) {
      if (off <= dead) {
        this.shiftedSince = null;
      } else {
        this.shiftedSince ??= now;
        if (now - this.shiftedSince >= DWELL_MS) this.gliding = true;
      }
    }
    if (this.gliding) {
      const k = 1 - Math.exp(-dt / GLIDE_MS);
      this.cx += (targetX - this.cx) * k;
      this.cy += (targetY - this.cy) * k;
      if (Math.hypot(targetX - this.cx, targetY - this.cy) < dead / 4) {
        this.gliding = false;
        this.shiftedSince = null;
      }
    }
    return this.centre;
  }

  /** Jumps straight to a position (a shape change, or a new camera size). */
  reset(x: number, y: number) {
    this.cx = x;
    this.cy = y;
    this.shiftedSince = null;
    this.gliding = false;
  }
}

/** The bits of a 2D canvas context the outlines need, so tests can record the calls. */
export type PathContext = {
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, radius: number, start: number, end: number): void;
  arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void;
  closePath(): void;
};

/** Corner radius of the rounded rectangle, as a fraction of its shorter side. */
const ROUNDED_RADIUS = 0.12;

/** Traces the shape's outline inside `box` (the caller then fills or clips). Rounded: portrait with rounded corners; circle: inscribed circle; arch: flat bottom, semicircular top. */
export function tracePanelPath(ctx: PathContext, shape: PanelShape, box: Rect) {
  const { x, y, width, height } = box;
  ctx.beginPath();
  if (shape === "circle") {
    ctx.arc(x + width / 2, y + height / 2, Math.min(width, height) / 2, 0, Math.PI * 2);
  } else if (shape === "arch") {
    const r = width / 2;
    ctx.moveTo(x, y + height);
    ctx.lineTo(x, y + r);
    ctx.arc(x + r, y + r, r, Math.PI, 0);
    ctx.lineTo(x + width, y + height);
  } else {
    const r = Math.min(width, height) * ROUNDED_RADIUS;
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
  }
  ctx.closePath();
}
