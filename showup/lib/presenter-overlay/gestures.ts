/**
 * Host hand gestures (Showup 13): the pure, clock-free logic.
 * Turns MediaPipe hand landmarks into a laser pointer, a pinch-to-zoom (with pan) and an open-palm reset,
 * with hold times, a cooldown and light smoothing so ordinary talking gestures don't trigger anything.
 * Time is passed in, like speaker-follow.ts. The compositor does the detection and the drawing.
 */

export type Landmark = { x: number; y: number };
export type Pose = "point" | "pinch" | "palm" | "pen" | "fist" | "thumbsup" | "thumbsdown" | "none";
export type ReactionKind = "thumbsup" | "thumbsdown" | "wave";

/** Hold times before a gesture takes effect. */
export const POINT_HOLD_MS = 300;
export const PINCH_HOLD_MS = 500;
export const PALM_HOLD_MS = 500;
export const PEN_HOLD_MS = 300;
/** A fist must be held this long to turn the spotlight on (longer, so a resting fist doesn't trigger it). */
export const FIST_HOLD_MS = 800;
/** A thumb must be held up or down this long to react. */
export const THUMB_HOLD_MS = 400;
/** After a reaction nothing else reacts for this long, so a lingering thumb or wave doesn't spam. */
export const REACTION_COOLDOWN_MS = 3000;
/** A wave is at least this many changes of direction within the window, over at least this much sideways travel (fractions of the frame width). */
export const WAVE_WINDOW_MS = 1500;
export const WAVE_REVERSALS = 3;
export const WAVE_AMPLITUDE = 0.08;
/** A sideways move must be at least this far to count as a change of direction (so hand tremor doesn't). */
const WAVE_MIN_SWING = 0.025;
/** The palm reset needs the wrist to have stayed within this (fraction of the frame) for the whole hold. */
export const STILL_LIMIT = 0.05;
/** How long the "reaction" indicator stays up. */
const REACTION_LABEL_MS = 1500;
/** The spotlight fades out over this long after the fist opens. */
export const SPOTLIGHT_FADE_MS = 500;
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
const MIDDLE_TIP = 12;

/** A hand with any landmark this close to (or past) the frame edge is only partly in frame. */
const EDGE = 0.01;
/** Thumb and index tips closer than this fraction of the hand's size are pinching. */
const PINCH_RATIO = 0.3;
/** A finger is extended when its tip is this much farther from the wrist than its middle joint, and curled when it is nearer. */
const EXTENDED_RATIO = 1.1;
const CURLED_RATIO = 1.0;
/** Index and middle fingertips closer than this fraction of the hand's size are "together" (the pen pose); a peace sign is wider. */
const PEN_TOGETHER_RATIO = 0.3;
/** In a fist every fingertip is folded in close to the palm: nearer the wrist than this multiple of the hand's size. */
const FIST_TIP_RATIO = 1.0;
/** A fist only counts when raised: the wrist above this fraction of the frame height (y grows downward), i.e. out of the lowest ~30%. */
export const FIST_RAISED_Y = 0.7;
/** Palm landmarks (wrist and the knuckles), averaged for "the middle of the hand". */
const PALM_POINTS = [0, 5, 9, 13, 17];
/** A thumb is "out" when its tip is this far from the index knuckle (fraction of the hand's size), and clearly up or down when this far above/below the wrist and knuckle. */
const THUMB_OUT_RATIO = 0.6;
const THUMB_WRIST_RATIO = 0.6;
const THUMB_KNUCKLE_RATIO = 0.4;
/** Hands smaller than this (fraction of the frame) are too small to read. */
const MIN_HAND_SIZE = 0.03;

export type PoseReading = {
  pose: Pose;
  /** Index fingertip. */
  tip: Landmark;
  /** Midpoint of thumb and index tips — where a pinch is. */
  pinchPoint: Landmark;
  /** The middle of the hand (wrist and knuckles averaged). */
  palm: Landmark;
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
  const palmPoints = PALM_POINTS.map((i) => landmarks[i]).filter(Boolean);
  const palm = { x: palmPoints.reduce((t, p) => t + p.x, 0) / (palmPoints.length || 1), y: palmPoints.reduce((t, p) => t + p.y, 0) / (palmPoints.length || 1) };
  const none: PoseReading = { pose: "none", tip, pinchPoint, palm };
  if (landmarks.length < 21) return none;
  if (landmarks.some((p) => p.x < EDGE || p.x > 1 - EDGE || p.y < EDGE || p.y > 1 - EDGE)) return none;
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
  // Thumbs up / down before the fist: the fingers are curled just the same, but the thumb sticks out clearly up or down.
  if (state.every((s) => s === "curled") && dist(thumb, landmarks[5]) > THUMB_OUT_RATIO * size) {
    const knuckle = landmarks[5];
    if (thumb.y <= wrist.y - THUMB_WRIST_RATIO * size && thumb.y <= knuckle.y - THUMB_KNUCKLE_RATIO * size) return { pose: "thumbsup", tip, pinchPoint, palm };
    if (thumb.y >= wrist.y + THUMB_WRIST_RATIO * size && thumb.y >= knuckle.y + THUMB_KNUCKLE_RATIO * size) return { pose: "thumbsdown", tip, pinchPoint, palm };
  }
  // A fist first: with the thumb folded over the fingers its tip can sit near the index tip, which must not read as a pinch.
  // The fingertips of a real pinch are held out in front of the palm; a fist's are tucked in against it.
  if (state.every((s) => s === "curled") && FINGERS.every(([t]) => dist(landmarks[t], wrist) < FIST_TIP_RATIO * size)) {
    return wrist.y <= FIST_RAISED_Y ? { pose: "fist", tip, pinchPoint, palm } : none;
  }
  if (dist(thumb, tip) < PINCH_RATIO * size) return { pose: "pinch", tip, pinchPoint, palm };
  const [index, ...others] = state;
  if (index === "extended" && others.every((s) => s === "curled")) return { pose: "point", tip, pinchPoint, palm };
  const [middle, ring, pinky] = others;
  if (index === "extended" && middle === "extended" && ring === "curled" && pinky === "curled" && dist(tip, landmarks[MIDDLE_TIP]) < PEN_TOGETHER_RATIO * size) {
    return { pose: "pen", tip, pinchPoint, palm };
  }
  if (state.every((s) => s === "extended")) return { pose: "palm", tip, pinchPoint, palm };
  return none;
}

/**
 * True when the samples (wrist x, 0–1 of the frame width, with times in ms) within the last WAVE_WINDOW_MS show a wave:
 * at least WAVE_REVERSALS changes of direction (each a swing of WAVE_MIN_SWING or more) over at least WAVE_AMPLITUDE of travel.
 */
export function detectWave(samples: readonly { t: number; x: number }[], now: number): boolean {
  const recent = samples.filter((sample) => now - sample.t <= WAVE_WINDOW_MS);
  if (recent.length < 4) return false;
  const xs = recent.map((sample) => sample.x);
  if (Math.max(...xs) - Math.min(...xs) < WAVE_AMPLITUDE) return false;
  // Zigzag: a swing of WAVE_MIN_SWING against the current direction is a reversal.
  let direction = 0;
  let extreme = xs[0];
  let reversals = 0;
  for (const x of xs) {
    if (direction === 0) {
      if (Math.abs(x - extreme) >= WAVE_MIN_SWING) {
        direction = x > extreme ? 1 : -1;
        extreme = x;
      }
    } else if (direction > 0) {
      if (x > extreme) extreme = x;
      else if (extreme - x >= WAVE_MIN_SWING) {
        reversals++;
        direction = -1;
        extreme = x;
      }
    } else {
      if (x < extreme) extreme = x;
      else if (x - extreme >= WAVE_MIN_SWING) {
        reversals++;
        direction = 1;
        extreme = x;
      }
    }
  }
  return reversals >= WAVE_REVERSALS;
}

export type GestureAction =
  /** Zoom the screen toward this point (camera-frame coordinates of the pinch). */
  | { type: "zoom"; u: number; v: number }
  /** The pinch is being held after the zoom: the pinched hand is now at this point (drives panning). */
  | { type: "pan"; u: number; v: number }
  | { type: "reset" }
  /** A quick reaction to show near the host's ghost. */
  | { type: "reaction"; kind: ReactionKind };

export type GestureState = {
  /** The laser dot, in camera-frame coordinates, while pointing or fading out; `fade` goes 1 → 0. */
  pointer: { u: number; v: number; fade: number } | null;
  /** The pen tip (camera-frame coordinates, smoothed) while a stroke is being drawn; null otherwise. */
  pen: { u: number; v: number } | null;
  /** The middle of the hand (camera-frame coordinates, smoothed) while a hand is in view; null once it has been gone a moment. */
  hand: { u: number; v: number } | null;
  /** The fist spotlight: 1 while the fist is held (after the hold), fading to 0 after it opens; null when off. */
  spotlight: { alpha: number } | null;
  actions: GestureAction[];
  /** What is currently recognized, for the host's (not streamed) indicator. */
  label: "pointing" | "zooming" | "reset" | "drawing" | "spotlight" | ReactionKind | null;
};

const POSES: readonly Pose[] = ["point", "pinch", "palm", "pen", "fist", "thumbsup", "thumbsdown"];

export class GestureTracker {
  private since: Record<string, number | null> = { point: null, pinch: null, palm: null, pen: null, fist: null, thumbsup: null, thumbsdown: null };
  private lastSeen: Record<string, number> = { point: 0, pinch: 0, palm: 0, pen: 0, fist: 0, thumbsup: 0, thumbsdown: 0 };
  private thumbFired: Record<string, boolean> = { thumbsup: false, thumbsdown: false };
  private waveFired = false;
  private reactionCooldownUntil = 0;
  private reactionLabel: ReactionKind | null = null;
  private reactionLabelUntil = 0;
  private wrist: { t: number; x: number; y: number }[] = [];
  private waveSamples: { t: number; x: number }[] = [];
  private spotlightActive = false;
  private spotlightEndedAt = 0;
  private handX = 0;
  private handY = 0;
  private handAt: number | null = null;
  private handSeenAt = -Infinity;
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

  private react(now: number, kind: ReactionKind, actions: GestureAction[]) {
    if (now < this.reactionCooldownUntil) return;
    this.reactionCooldownUntil = now + REACTION_COOLDOWN_MS;
    this.reactionLabel = kind;
    this.reactionLabelUntil = now + REACTION_LABEL_MS;
    actions.push({ type: "reaction", kind });
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
        if (pose === "palm") {
          this.palmFired = false;
          this.waveFired = false;
          this.waveSamples = [];
        }
        if (pose === "thumbsup" || pose === "thumbsdown") this.thumbFired[pose] = false;
      }
    }
    const actions: GestureAction[] = [];
    // Wrist track, for "has the hand been still?" (the palm reset) and the wave detector (open palm only).
    if (landmarks && reading) {
      this.wrist.push({ t: now, x: landmarks[0].x, y: landmarks[0].y });
      this.wrist = this.wrist.filter((sample) => now - sample.t <= WAVE_WINDOW_MS + 500);
      if (raw === "palm") this.waveSamples.push({ t: now, x: landmarks[0].x });
      this.waveSamples = this.waveSamples.filter((sample) => now - sample.t <= WAVE_WINDOW_MS);
    }

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

    // The middle of the hand, smoothed, for the spotlight to follow (and for a sticky spotlight to sit on).
    if (reading) {
      if (this.handAt === null || now - this.handSeenAt > GRACE_MS) {
        this.handX = reading.palm.x;
        this.handY = reading.palm.y;
      } else {
        const k = 1 - Math.exp(-Math.max(0, now - this.handAt) / SMOOTH_MS);
        this.handX += (reading.palm.x - this.handX) * k;
        this.handY += (reading.palm.y - this.handY) * k;
      }
      this.handAt = now;
      this.handSeenAt = now;
    }
    const hand = now - this.handSeenAt <= GRACE_MS ? { u: this.handX, v: this.handY } : null;

    // Spotlight: a raised fist held for FIST_HOLD_MS; fades out after it opens.
    if (this.held("fist", now, FIST_HOLD_MS) && raw === "fist") {
      this.spotlightActive = true;
    } else if (this.spotlightActive && now - this.lastSeen.fist > GRACE_MS) {
      this.spotlightActive = false;
      this.spotlightEndedAt = this.lastSeen.fist;
    }
    const spotlightFade = this.spotlightActive ? 1 : 1 - (now - this.spotlightEndedAt) / SPOTLIGHT_FADE_MS;
    const spotlight = this.spotlightActive || (this.spotlightEndedAt > 0 && spotlightFade > 0) ? { alpha: Math.max(0, Math.min(1, spotlightFade)) } : null;

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

    // Reactions: a thumb held up or down, or a wave. Each fires once per hold; nothing reacts again for REACTION_COOLDOWN_MS
    // (a hold that finishes during the cooldown is used up, so a lingering thumb doesn't fire the moment it ends).
    for (const kind of ["thumbsup", "thumbsdown"] as const) {
      if (this.held(kind, now, THUMB_HOLD_MS) && !this.thumbFired[kind]) {
        this.thumbFired[kind] = true;
        this.react(now, kind, actions);
      }
    }
    if (!this.waveFired && this.held("palm", now, 0) && detectWave(this.waveSamples, now)) {
      this.waveFired = true;
      this.waveSamples = [];
      this.react(now, "wave", actions);
    }

    // Open palm: held (and still) to reset the zoom. A waving hand isn't still, so a wave never resets.
    if (this.held("palm", now, PALM_HOLD_MS) && !this.palmFired && now >= this.cooldownUntil && this.still(now, PALM_HOLD_MS)) {
      this.palmFired = true;
      this.cooldownUntil = now + COOLDOWN_MS;
      this.resetLabelUntil = now + RESET_LABEL_MS;
      actions.push({ type: "reset" });
    }

    const fade = this.pointerActive ? 1 : 1 - (now - this.pointerEndedAt) / POINTER_FADE_MS;
    const pointer = this.pointerActive || (this.pointerEndedAt > 0 && fade > 0) ? { u: this.pointerX, v: this.pointerY, fade: Math.max(0, Math.min(1, fade)) } : null;
    const pen = this.penActive ? { u: this.penX, v: this.penY } : null;
    const label = this.reactionLabel && now < this.reactionLabelUntil
      ? this.reactionLabel
      : this.pointerActive
      ? "pointing"
      : this.penActive
        ? "drawing"
        : this.spotlightActive
          ? "spotlight"
          : this.pinching
            ? "zooming"
            : now < this.resetLabelUntil
              ? "reset"
              : null;
    return { pointer, pen, hand, spotlight, actions, label };
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
