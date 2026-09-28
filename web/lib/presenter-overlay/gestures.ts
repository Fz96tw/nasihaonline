/**
 * Host hand gestures: the pure, clock-free logic.
 * Turns MediaPipe hand landmarks into a laser pointer, a pinch-to-zoom (with pan) and an open-palm reset,
 * with hold times, a cooldown and light smoothing so ordinary talking gestures don't trigger anything.
 * Time is passed in. The compositor does the detection and the drawing.
 *
 * Trimmed from showup/lib/presenter-overlay/gestures.ts (Showup 13) — core poses only (point, pinch, palm,
 * pen). The "L" shape, eraser, fist-spotlight and thumbsup/thumbsdown/wave reactions are Showup-only
 * features (Showup 19/20/29/31) that this overlay doesn't have a use for.
 */

export type Landmark = { x: number; y: number };
export type Pose = "point" | "pinch" | "palm" | "pen" | "none";

/** Hold times before a gesture takes effect. */
export const POINT_HOLD_MS = 300;
export const PINCH_HOLD_MS = 500;
export const PALM_HOLD_MS = 500;
export const PEN_HOLD_MS = 300;
/** The palm reset needs the wrist to have stayed within this (fraction of the frame) for the whole hold. */
export const STILL_LIMIT = 0.05;
/** How long a pose may drop out (a misread frame) without its hold timer restarting. */
export const GRACE_MS = 150;
/** The pointer dot fades out over this long after the pointing ends. */
export const POINTER_FADE_MS = 500;
/** After a zoom or reset nothing else fires for this long. */
export const COOLDOWN_MS = 800;
/** Time constant of the light smoothing on the fingertip. */
const SMOOTH_MS = 50;
/** How long the "reset" indicator stays up. */
const RESET_LABEL_MS = 800;
/** How much wrist history `still()` needs on hand — PALM_HOLD_MS plus a margin. */
const WRIST_HISTORY_MS = PALM_HOLD_MS + 500;

const WRIST = 0;
const THUMB_TIP = 4;
const MIDDLE_MCP = 9;
/** [tip, pip] for index, middle, ring, pinky. */
const FINGERS: readonly [number, number][] = [
  [8, 6],
  [12, 10],
  [16, 14],
  [20, 18],
];
const INDEX_TIP = 8;
const MIDDLE_TIP = 12;

/**
 * A hand with any landmark this close to (or past) the left, right or top frame edge is only partly in
 * frame there, so its read is unreliable and discarded. The bottom edge is not checked the same way: a
 * raised hand's wrist and palm base are the lowest points and routinely sit below the visible frame while
 * the fingers above them (what's actually being classified) are still fully in view.
 */
const EDGE = 0.01;
/** Thumb and index tips closer than this fraction of the hand's size are pinching. */
const PINCH_RATIO = 0.3;
/** A finger is extended when its tip is this much farther from the wrist than its middle joint, and curled when it is nearer. */
const EXTENDED_RATIO = 1.1;
const CURLED_RATIO = 1.0;
/** Index and middle fingertips closer than this fraction of the hand's size are "together" (the pen pose); a peace sign is wider. */
const PEN_TOGETHER_RATIO = 0.3;
/** Hands smaller than this (fraction of the frame) are too small to read. */
const MIN_HAND_SIZE = 0.03;

export type PoseReading = {
  pose: Pose;
  /** Index fingertip. */
  tip: Landmark;
  /** Midpoint of thumb and index tips — where a pinch is. */
  pinchPoint: Landmark;
};

/**
 * Classifies one hand (21 landmarks, coordinates 0–1 of the camera frame). `aspect` is the frame's width / height,
 * so distances aren't skewed on a wide frame. Ambiguous hands (a finger half-curled) are "none", and so is a hand
 * clipped on the left, right or top of frame.
 */
export function classifyPose(landmarks: readonly Landmark[], aspect = 1): PoseReading {
  const tip = landmarks[INDEX_TIP];
  const thumb = landmarks[THUMB_TIP];
  const pinchPoint = { x: (tip.x + thumb.x) / 2, y: (tip.y + thumb.y) / 2 };
  const none: PoseReading = { pose: "none", tip, pinchPoint };
  if (landmarks.length < 21) return none;
  if (landmarks.some((p) => p.x < EDGE || p.x > 1 - EDGE || p.y < EDGE)) return none;
  const dist = (a: Landmark, b: Landmark) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);
  const wrist = landmarks[WRIST];
  const size = dist(wrist, landmarks[MIDDLE_MCP]);
  if (size < MIN_HAND_SIZE) return none;

  const state = FINGERS.map(([t, p]) => {
    const tipDistance = dist(landmarks[t], wrist);
    const jointDistance = dist(landmarks[p], wrist);
    if (tipDistance > jointDistance * EXTENDED_RATIO) return "extended";
    if (tipDistance < jointDistance * CURLED_RATIO) return "curled";
    return "unsure";
  });
  if (dist(thumb, tip) < PINCH_RATIO * size) return { pose: "pinch", tip, pinchPoint };
  const [index, ...others] = state;
  if (index === "extended" && others.every((s) => s === "curled")) return { pose: "point", tip, pinchPoint };
  const [middle, ring, pinky] = others;
  if (index === "extended" && middle === "extended" && ring === "curled" && pinky === "curled" && dist(tip, landmarks[MIDDLE_TIP]) < PEN_TOGETHER_RATIO * size) {
    return { pose: "pen", tip, pinchPoint };
  }
  if (state.every((s) => s === "extended")) return { pose: "palm", tip, pinchPoint };
  return none;
}

export type GestureAction =
  /** Zoom the screen toward this point (camera-frame coordinates of the pinch). */
  | { type: "zoom"; u: number; v: number }
  /** The pinch is being held after the zoom: the pinched hand is now at this point (drives panning). */
  | { type: "pan"; u: number; v: number }
  | { type: "reset" };

export type GestureState = {
  /** The laser dot, in camera-frame coordinates, while pointing or fading out; `fade` goes 1 → 0. */
  pointer: { u: number; v: number; fade: number } | null;
  /** The pen tip (camera-frame coordinates, smoothed) while a stroke is being drawn; null otherwise. */
  pen: { u: number; v: number } | null;
  actions: GestureAction[];
  /** What is currently recognized, for the host's (not streamed) indicator. */
  label: "pointing" | "zooming" | "reset" | "drawing" | null;
};

const POSES: readonly Pose[] = ["point", "pinch", "palm", "pen"];

export class GestureTracker {
  private since: Record<string, number | null> = { point: null, pinch: null, palm: null, pen: null };
  private lastSeen: Record<string, number> = { point: 0, pinch: 0, palm: 0, pen: 0 };
  private wrist: { t: number; x: number; y: number }[] = [];
  private penActive = false;
  private penX = 0;
  private penY = 0;
  private penAt: number | null = null;
  private pointerActive = false;
  private pointerEndedAt = 0;
  private pointerX = 0;
  private pointerY = 0;
  private pointerAt: number | null = null;
  private cooldownUntil = 0;
  private pinchFired = false;
  private palmFired = false;
  private pinching = false;
  private resetLabelUntil = 0;
  private panX = 0;
  private panY = 0;
  private panAt: number | null = null;

  private held(pose: Pose, now: number, duration: number): boolean {
    const since = this.since[pose];
    return since !== null && now - since >= duration && now - this.lastSeen[pose] <= GRACE_MS;
  }

  /** True when the wrist stayed within STILL_LIMIT (both ways) over the last `duration` ms. */
  private still(now: number, duration: number): boolean {
    const recent = this.wrist.filter((sample) => now - sample.t <= duration);
    if (recent.length === 0) return false;
    const xs = recent.map((sample) => sample.x);
    const ys = recent.map((sample) => sample.y);
    return Math.max(...xs) - Math.min(...xs) <= STILL_LIMIT && Math.max(...ys) - Math.min(...ys) <= STILL_LIMIT;
  }

  /** Feeds the hand seen at `now` (ms), or null when there's none. Returns what to draw and do. */
  update(now: number, landmarks: readonly Landmark[] | null, aspect = 1): GestureState {
    const reading = landmarks ? classifyPose(landmarks, aspect) : null;
    const raw: Pose = reading ? reading.pose : "none";
    for (const pose of POSES) {
      if (pose === raw) {
        this.since[pose] ??= now;
        this.lastSeen[pose] = now;
      } else if (this.since[pose] !== null && now - this.lastSeen[pose] > GRACE_MS) {
        this.since[pose] = null;
        if (pose === "pinch") this.pinchFired = false;
        if (pose === "palm") this.palmFired = false;
      }
    }
    const actions: GestureAction[] = [];
    // Wrist track, for "has the hand been still?" (the palm reset).
    if (landmarks && reading) {
      this.wrist.push({ t: now, x: landmarks[0].x, y: landmarks[0].y });
      this.wrist = this.wrist.filter((sample) => now - sample.t <= WRIST_HISTORY_MS);
    }

    // Laser pointer: held for POINT_HOLD_MS to start; fades out after it ends.
    const pointing = this.held("point", now, POINT_HOLD_MS);
    if (pointing && reading && raw === "point") {
      if (!this.pointerActive || this.pointerAt === null) {
        this.pointerX = reading.tip.x;
        this.pointerY = reading.tip.y;
      } else {
        const k = 1 - Math.exp(-Math.max(0, now - this.pointerAt) / SMOOTH_MS);
        this.pointerX += (reading.tip.x - this.pointerX) * k;
        this.pointerY += (reading.tip.y - this.pointerY) * k;
      }
      this.pointerAt = now;
      this.pointerActive = true;
    } else if (this.pointerActive && now - this.lastSeen.point > GRACE_MS) {
      this.pointerActive = false;
      this.pointerEndedAt = this.lastSeen.point;
      this.pointerAt = null;
    }

    // Pen: two fingers together, held to start a stroke that follows the index fingertip until the pose ends.
    if (this.held("pen", now, PEN_HOLD_MS) && reading && raw === "pen") {
      if (!this.penActive || this.penAt === null) {
        this.penX = reading.tip.x;
        this.penY = reading.tip.y;
      } else {
        const k = 1 - Math.exp(-Math.max(0, now - this.penAt) / SMOOTH_MS);
        this.penX += (reading.tip.x - this.penX) * k;
        this.penY += (reading.tip.y - this.penY) * k;
      }
      this.penAt = now;
      this.penActive = true;
    } else if (this.penActive && now - this.lastSeen.pen > GRACE_MS) {
      this.penActive = false;
      this.penAt = null;
    }

    // Pinch: held to zoom, then the pinched hand pans.
    const pinchHeld = this.held("pinch", now, PINCH_HOLD_MS);
    if (pinchHeld && !this.pinchFired && now >= this.cooldownUntil && reading) {
      this.pinchFired = true;
      this.pinching = true;
      this.cooldownUntil = now + COOLDOWN_MS;
      actions.push({ type: "zoom", u: reading.pinchPoint.x, v: reading.pinchPoint.y });
      this.panX = reading.pinchPoint.x;
      this.panY = reading.pinchPoint.y;
      this.panAt = now;
    } else if (this.pinching && raw === "pinch" && reading) {
      const k = 1 - Math.exp(-Math.max(0, now - (this.panAt ?? now)) / SMOOTH_MS);
      this.panX += (reading.pinchPoint.x - this.panX) * k;
      this.panY += (reading.pinchPoint.y - this.panY) * k;
      this.panAt = now;
      actions.push({ type: "pan", u: this.panX, v: this.panY });
    }
    if (this.pinching && now - this.lastSeen.pinch > GRACE_MS) {
      this.pinching = false;
      this.panAt = null;
    }

    // Open palm: held (and still) to reset the zoom.
    if (this.held("palm", now, PALM_HOLD_MS) && !this.palmFired && now >= this.cooldownUntil && this.still(now, PALM_HOLD_MS)) {
      this.palmFired = true;
      this.cooldownUntil = now + COOLDOWN_MS;
      this.resetLabelUntil = now + RESET_LABEL_MS;
      actions.push({ type: "reset" });
    }

    const fade = this.pointerActive ? 1 : 1 - (now - this.pointerEndedAt) / POINTER_FADE_MS;
    const pointer = this.pointerActive || (this.pointerEndedAt > 0 && fade > 0) ? { u: this.pointerX, v: this.pointerY, fade: Math.max(0, Math.min(1, fade)) } : null;
    const pen = this.penActive ? { u: this.penX, v: this.penY } : null;
    const label = this.pointerActive
      ? "pointing"
      : this.penActive
        ? "drawing"
        : this.pinching
          ? "zooming"
          : now < this.resetLabelUntil
            ? "reset"
            : null;
    return { pointer, pen, actions, label };
  }
}

/** Where a fingertip lands on the output frame, given how the host's ghost is drawn. */
export type GhostPlacement = {
  /** The ghost's left edge and width on the output, and its top edge and height. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** The ghost is drawn flipped left-to-right. */
  mirror: boolean;
};

/**
 * Maps a point in the camera frame (0–1) to output-frame pixels through the same transform the ghost is drawn with
 * — placement, size and mirroring — so a fingertip lands exactly on the ghost's fingertip.
 */
export function cameraToOutput(u: number, v: number, ghost: GhostPlacement): { x: number; y: number } {
  return { x: ghost.x + (ghost.mirror ? 1 - u : u) * ghost.width, y: ghost.y + v * ghost.height };
}
