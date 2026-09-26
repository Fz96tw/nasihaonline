/**
 * Host hand gestures (Showup 13): the pure, clock-free logic.
 * Turns MediaPipe hand landmarks into a laser pointer, a pinch-to-zoom (with pan) and an open-palm reset,
 * with hold times, a cooldown and light smoothing so ordinary talking gestures don't trigger anything.
 * Time is passed in, like speaker-follow.ts. The compositor does the detection and the drawing.
 */

export type Landmark = { x: number; y: number };
export type Pose = "point" | "pinch" | "palm" | "none";

/** Hold times before a gesture takes effect. */
export const POINT_HOLD_MS = 300;
export const PINCH_HOLD_MS = 500;
export const PALM_HOLD_MS = 500;
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

/** A hand with any landmark this close to (or past) the frame edge is only partly in frame. */
const EDGE = 0.01;
/** Thumb and index tips closer than this fraction of the hand's size are pinching. */
const PINCH_RATIO = 0.3;
/** A finger is extended when its tip is this much farther from the wrist than its middle joint, and curled when it is nearer. */
const EXTENDED_RATIO = 1.1;
const CURLED_RATIO = 1.0;
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
 * so distances aren't skewed on a wide frame. Ambiguous hands (a finger half-curled) are "none", and so is a hand that
 * is only partly in frame.
 */
export function classifyPose(landmarks: readonly Landmark[], aspect = 1): PoseReading {
  const tip = landmarks[INDEX_TIP];
  const thumb = landmarks[THUMB_TIP];
  const pinchPoint = { x: (tip.x + thumb.x) / 2, y: (tip.y + thumb.y) / 2 };
  const none: PoseReading = { pose: "none", tip, pinchPoint };
  if (landmarks.length < 21) return none;
  if (landmarks.some((p) => p.x < EDGE || p.x > 1 - EDGE || p.y < EDGE || p.y > 1 - EDGE)) return none;
  const dist = (a: Landmark, b: Landmark) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);
  const wrist = landmarks[WRIST];
  const size = dist(wrist, landmarks[MIDDLE_MCP]);
  if (size < MIN_HAND_SIZE) return none;

  if (dist(thumb, tip) < PINCH_RATIO * size) return { pose: "pinch", tip, pinchPoint };

  const state = FINGERS.map(([t, p]) => {
    const tipDistance = dist(landmarks[t], wrist);
    const jointDistance = dist(landmarks[p], wrist);
    if (tipDistance > jointDistance * EXTENDED_RATIO) return "extended";
    if (tipDistance < jointDistance * CURLED_RATIO) return "curled";
    return "unsure";
  });
  const [index, ...others] = state;
  if (index === "extended" && others.every((s) => s === "curled")) return { pose: "point", tip, pinchPoint };
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
  actions: GestureAction[];
  /** What is currently recognized, for the host's (not streamed) indicator. */
  label: "pointing" | "zooming" | "reset" | null;
};

const POSES: readonly Pose[] = ["point", "pinch", "palm"];

export class GestureTracker {
  private since: Record<string, number | null> = { point: null, pinch: null, palm: null };
  private lastSeen: Record<string, number> = { point: 0, pinch: 0, palm: 0 };
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

    // Laser pointer: held for POINTER_HOLD_MS to start; fades out after it ends.
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

    // Open palm: held to reset the zoom.
    if (this.held("palm", now, PALM_HOLD_MS) && !this.palmFired && now >= this.cooldownUntil) {
      this.palmFired = true;
      this.cooldownUntil = now + COOLDOWN_MS;
      this.resetLabelUntil = now + RESET_LABEL_MS;
      actions.push({ type: "reset" });
    }

    const fade = this.pointerActive ? 1 : 1 - (now - this.pointerEndedAt) / POINTER_FADE_MS;
    const pointer = this.pointerActive || (this.pointerEndedAt > 0 && fade > 0) ? { u: this.pointerX, v: this.pointerY, fade: Math.max(0, Math.min(1, fade)) } : null;
    const label = this.pointerActive ? "pointing" : this.pinching ? "zooming" : now < this.resetLabelUntil ? "reset" : null;
    return { pointer, actions, label };
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
  /** For a keep-background panel: the part of the camera frame it shows (0–1 of the frame). Null = the whole frame. */
  crop?: { x: number; y: number; width: number; height: number } | null;
};

/**
 * Maps a point in the camera frame (0–1) to output-frame pixels through the same transform the ghost is drawn with
 * — placement, size, panel crop and mirroring — so a fingertip lands exactly on the ghost's fingertip.
 */
export function cameraToOutput(u: number, v: number, ghost: GhostPlacement): { x: number; y: number } {
  const crop = ghost.crop;
  const nu = crop ? (u - crop.x) / crop.width : u;
  const nv = crop ? (v - crop.y) / crop.height : v;
  return { x: ghost.x + (ghost.mirror ? 1 - nu : nu) * ghost.width, y: ghost.y + nv * ghost.height };
}
