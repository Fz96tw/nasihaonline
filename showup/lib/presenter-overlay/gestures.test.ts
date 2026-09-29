import { test } from "node:test";
import assert from "node:assert/strict";
import {
  REACTION_COOLDOWN_MS,
  THUMB_HOLD_MS,
  WAVE_WINDOW_MS,
  detectWave,
  COOLDOWN_MS,
  FIST_HOLD_MS,
  SPOTLIGHT_FADE_MS,
  PEN_HOLD_MS,
  SHAPE_HOLD_MS,
  ERASER_HOLD_MS,
  HIGHLIGHT_HOLD_MS,
  SHAPE_MAX_COS,
  SHAPE_THUMB_OUT_RATIO,
  GRACE_MS,
  GestureTracker,
  PALM_HOLD_MS,
  PINCH_HOLD_MS,
  STAMP_HOLD_MS,
  POINTER_FADE_MS,
  POINT_HOLD_MS,
  V_SIGN_HOLD_MS,
  cameraToOutput,
  classifyPose,
  type GestureAction,
  type Landmark,
} from "./gestures.ts";
import { ScreenViewport, ZOOM, ZOOM_GLIDE_MS, outputToScreen, screenToOutput } from "./screen-zoom.ts";

type Finger = "ext" | "curl" | "half";

/** A right-side-up hand with the wrist at the bottom; `ox` shifts it sideways. Fingers: index, middle, ring, pinky. */
function hand(fingers: [Finger, Finger, Finger, Finger], opts: { pinch?: boolean; midpinch?: boolean; ox?: number; oy?: number; apart?: boolean } = {}): Landmark[] {
  const ox = opts.ox ?? 0;
  const oy = opts.oy ?? 0;
  const points: Landmark[] = Array.from({ length: 21 }, () => ({ x: 0.5 + ox, y: 0.9 + oy }));
  points[0] = { x: 0.5 + ox, y: 0.9 + oy };
  // Thumb, off to the side.
  points[1] = { x: 0.42 + ox, y: 0.85 + oy };
  points[2] = { x: 0.38 + ox, y: 0.8 + oy };
  points[3] = { x: 0.35 + ox, y: 0.76 + oy };
  points[4] = { x: 0.33 + ox, y: 0.72 + oy };
  const columns = [0.5, 0.55, 0.6, 0.65];
  const bases = [5, 9, 13, 17];
  fingers.forEach((state, i) => {
    // `apart` spreads the other fingers away from the index finger (a peace sign rather than two fingers together).
    const x = columns[i] + ox - 0.05 + (opts.apart && i >= 1 ? 0.1 : 0);
    const mcp = { x, y: 0.7 + oy };
    const pip = state === "curl" ? { x, y: 0.62 + oy } : { x, y: 0.6 + oy };
    const dip = state === "curl" ? { x, y: 0.68 + oy } : { x, y: 0.55 + oy };
    // extended: tip far above; curled: tip folded back down near the palm; half: about level with the pip.
    const tipY = state === "ext" ? 0.5 : state === "curl" ? 0.76 : 0.585;
    points[bases[i]] = mcp;
    points[bases[i] + 1] = pip;
    points[bases[i] + 2] = dip;
    points[bases[i] + 3] = { x, y: tipY + oy };
  });
  points[9] = { x: 0.5 + ox, y: 0.7 + oy }; // middle MCP defines the hand size (0.2)
  if (opts.pinch) points[4] = { x: points[8].x + 0.01, y: points[8].y + 0.01 };
  if (opts.midpinch) points[4] = { x: points[12].x + 0.01, y: points[12].y + 0.01 };
  return points;
}

const POINT = () => hand(["ext", "curl", "curl", "curl"]);
// A pinch holds the fingertips out in front of the palm (the index finger only half curled), unlike a fist.
const PINCH = () => hand(["half", "curl", "curl", "curl"], { pinch: true });
// Thumb to the middle fingertip instead, index kept out (aiming) so it's never mistaken for a fist or the real pinch.
const MIDPINCH = () => hand(["ext", "curl", "curl", "curl"], { midpinch: true });
/** A raised fist (wrist up in the frame) and a resting one (wrist low). */
const FIST = () => hand(["curl", "curl", "curl", "curl"], { oy: -0.3 });
const FIST_LOW = () => hand(["curl", "curl", "curl", "curl"]);
const PALM = () => hand(["ext", "ext", "ext", "ext"]);
const PEN = () => hand(["ext", "ext", "curl", "curl"]);
const PEACE = () => hand(["ext", "ext", "curl", "curl"], { apart: true });
/** A fist with the thumb stuck straight up (wrist low) or straight down (hand held up, wrist high). */
const THUMBS_UP = () => {
  const h = hand(["curl", "curl", "curl", "curl"]);
  h[4] = { x: 0.42, y: 0.45 };
  return h;
};
const THUMBS_DOWN = () => {
  const h = hand(["curl", "curl", "curl", "curl"], { oy: -0.4 });
  h[4] = { x: 0.42, y: 0.85 };
  return h;
};
/** An open palm waving side to side at 2 Hz, +-6% of the frame width. */
const WAVING = (t: number) => hand(["ext", "ext", "ext", "ext"], { ox: 0.06 * Math.sin((2 * Math.PI * 2 * t) / 1000) });
const TALK = () => hand(["half", "half", "curl", "half"]);

test("classifies pointing, pinching and an open palm", () => {
  assert.equal(classifyPose(POINT()).pose, "point");
  assert.equal(classifyPose(PINCH()).pose, "pinch");
  assert.equal(classifyPose(PALM()).pose, "palm");
  assert.equal(classifyPose(hand(["curl", "curl", "curl", "curl"])).pose, "none", "a fist is nothing");
  assert.equal(classifyPose(PEN()).pose, "pen", "two fingers together is the pen");
  assert.equal(classifyPose(PEACE()).pose, "v", "a peace sign is the V that toggles Voice Pin");
  assert.equal(classifyPose(hand(["ext", "ext", "ext", "curl"])).pose, "eraser", "three fingers together is the eraser");
  assert.equal(classifyPose(TALK()).pose, "none", "half-curled talking hands are nothing");
  assert.equal(classifyPose(FIST()).pose, "fist", "a raised fist");
  assert.equal(classifyPose(FIST_LOW()).pose, "none", "a fist held low in the frame is nothing");
  const foldedThumb = FIST();
  foldedThumb[4] = { x: foldedThumb[8].x + 0.01, y: foldedThumb[8].y + 0.01 }; // thumb folded over the fingers, tip beside the index tip
  assert.equal(classifyPose(foldedThumb).pose, "fist", "a fist with the thumb across is not a pinch");
});

test("a hand only partly in frame, or too small, is not classified", () => {
  assert.equal(classifyPose(hand(["ext", "curl", "curl", "curl"], { ox: 0.55 })).pose, "none");
  assert.equal(classifyPose(hand(["ext", "curl", "curl", "curl"], { oy: -0.5 })).pose, "none");
  assert.equal(classifyPose(POINT().slice(0, 10)).pose, "none");
});

test("a hand with the wrist below the bottom of frame still classifies, as long as the fingers are in view", () => {
  const low = hand(["ext", "curl", "curl", "curl"], { oy: 0.15 });
  assert.ok(low[0].y > 1, "the wrist itself is past the bottom edge");
  assert.equal(classifyPose(low).pose, "point");
});

/** Runs the tracker at 30 Hz from `from` to `to`; returns every action and the last state. */
function run(tracker: GestureTracker, from: number, to: number, landmarks: () => Landmark[] | null) {
  const actions: [number, GestureAction][] = [];
  let state = tracker.update(from, landmarks());
  for (let t = from; t <= to; t += 33) {
    state = tracker.update(t, landmarks());
    for (const a of state.actions) actions.push([t, a]);
  }
  return { actions, state };
}

test("pointing shows the pointer only after the hold, and it fades out about half a second after", () => {
  const tracker = new GestureTracker();
  let state = run(tracker, 0, POINT_HOLD_MS - 100, POINT).state;
  assert.equal(state.pointer, null, "too early");
  state = run(tracker, POINT_HOLD_MS - 67, POINT_HOLD_MS + 200, POINT).state;
  assert.ok(state.pointer && state.pointer.fade === 1);
  assert.equal(state.label, "pointing");
  const end = POINT_HOLD_MS + 300;
  // Hand lowered (no hand): dot fades over POINTER_FADE_MS, starting after the grace period.
  const soon = run(tracker, end, end + GRACE_MS + 100, () => null).state;
  assert.ok(soon.pointer && soon.pointer.fade < 1 && soon.pointer.fade > 0);
  const gone = run(tracker, end + GRACE_MS + 100, end + GRACE_MS + POINTER_FADE_MS + 200, () => null).state;
  assert.equal(gone.pointer, null);
  assert.equal(gone.label, null);
});

test("the pointer follows the fingertip smoothly, not in one jump", () => {
  const tracker = new GestureTracker();
  run(tracker, 0, 500, POINT);
  const before = tracker.update(520, POINT()).pointer as { u: number };
  const moved = hand(["ext", "curl", "curl", "curl"], { ox: 0.2 });
  const first = tracker.update(553, moved).pointer as { u: number };
  const target = moved[8].x;
  assert.ok(first.u > before.u && first.u < target, "moves toward the target without landing on it in one frame");
  const later = run(tracker, 586, 1200, () => moved).state.pointer as { u: number };
  assert.ok(Math.abs(later.u - target) < 0.01, "and gets there");
});

test("a brief misread frame does not restart the pointing hold", () => {
  const tracker = new GestureTracker();
  run(tracker, 0, 150, POINT);
  tracker.update(183, TALK()); // one bad frame
  const { state } = run(tracker, 216, POINT_HOLD_MS + 50, POINT);
  assert.ok(state.pointer);
});

test("normal talking gestures trigger nothing", () => {
  const tracker = new GestureTracker();
  const shapes = [TALK, () => hand(["curl", "curl", "curl", "curl"]), () => PEACE(), TALK];
  let t = 0;
  for (let i = 0; i < 60; i++) {
    const shape = shapes[i % shapes.length];
    const { state, actions } = run(tracker, t, t + 250, shape);
    assert.equal(state.pointer, null);
    assert.equal(actions.length, 0);
    t += 300;
  }
  // Waving a palm or a pointing finger around for less than the hold time also does nothing.
  const wave = new GestureTracker();
  for (let i = 0; i < 20; i++) {
    const pose = i % 2 === 0 ? PALM : POINT;
    const { state, actions } = run(wave, i * 400, i * 400 + 250, pose);
    assert.equal(actions.length, 0);
    assert.equal(state.pointer, null);
    run(wave, i * 400 + 260, i * 400 + 399, () => null);
  }
});

test("a held pinch zooms once at the pinch point, then reports the hand for panning", () => {
  const tracker = new GestureTracker();
  const { actions } = run(tracker, 0, PINCH_HOLD_MS + 600, PINCH);
  const zooms = actions.filter(([, a]) => a.type === "zoom");
  assert.equal(zooms.length, 1);
  assert.ok(zooms[0][0] >= PINCH_HOLD_MS);
  const zoom = zooms[0][1] as Extract<GestureAction, { type: "zoom" }>;
  const p = PINCH();
  assert.ok(Math.abs(zoom.u - (p[4].x + p[8].x) / 2) < 1e-9 && Math.abs(zoom.v - (p[4].y + p[8].y) / 2) < 1e-9);
  assert.ok(actions.filter(([, a]) => a.type === "pan").length > 5);
  assert.equal(actions.filter(([, a]) => a.type === "reset").length, 0);
});

test("a pinch shorter than the hold does nothing", () => {
  const tracker = new GestureTracker();
  const { actions } = run(tracker, 0, PINCH_HOLD_MS - 150, PINCH);
  assert.equal(actions.length, 0);
});

test("the thumb-to-middle pinch is its own pose, distinct from the thumb-to-index pinch", () => {
  assert.equal(classifyPose(MIDPINCH()).pose, "midpinch");
  assert.equal(classifyPose(PINCH()).pose, "pinch");
});

test("a held thumb-to-middle pinch drops a stamp once, aimed at the index fingertip, and does not zoom", () => {
  const tracker = new GestureTracker();
  const { actions } = run(tracker, 0, STAMP_HOLD_MS + 600, MIDPINCH);
  const stamps = actions.filter(([, a]) => a.type === "stamp");
  assert.equal(stamps.length, 1, "fires once per touch, not repeatedly while held");
  assert.ok(stamps[0][0] >= STAMP_HOLD_MS);
  const stamp = stamps[0][1] as Extract<GestureAction, { type: "stamp" }>;
  const m = MIDPINCH();
  assert.ok(Math.abs(stamp.u - m[8].x) < 1e-9 && Math.abs(stamp.v - m[8].y) < 1e-9, "aimed at the index tip, not the thumb-middle touch point");
  assert.equal(actions.filter(([, a]) => a.type === "zoom").length, 0, "the ordinary thumb-index pinch/zoom is unaffected");
});

test("a thumb-to-middle pinch shorter than the hold drops no stamp", () => {
  const tracker = new GestureTracker();
  const { actions } = run(tracker, 0, STAMP_HOLD_MS - 150, MIDPINCH);
  assert.equal(actions.length, 0);
});

test("releasing and re-touching the thumb-to-middle pinch drops a second stamp", () => {
  const tracker = new GestureTracker();
  const first = run(tracker, 0, STAMP_HOLD_MS + 100, MIDPINCH);
  assert.equal(first.actions.filter(([, a]) => a.type === "stamp").length, 1);
  const firedAt = first.actions[0][0];
  run(tracker, firedAt + 33, firedAt + GRACE_MS + 200, POINT); // release: back to plain pointing, long enough to clear the grace period
  const second = run(tracker, firedAt + GRACE_MS + 300, firedAt + GRACE_MS + STAMP_HOLD_MS + 500, MIDPINCH);
  assert.equal(second.actions.filter(([, a]) => a.type === "stamp").length, 1, "a fresh touch fires again");
});

test("a held V-sign toggles Voice Pin once per hold, not repeatedly while held", () => {
  const tracker = new GestureTracker();
  const { actions } = run(tracker, 0, V_SIGN_HOLD_MS + 600, PEACE);
  const toggles = actions.filter(([, a]) => a.type === "voice-toggle");
  assert.equal(toggles.length, 1, "fires once, however long the V is held");
  assert.ok(toggles[0][0] >= V_SIGN_HOLD_MS);
});

test("a V-sign shorter than the hold toggles nothing", () => {
  const tracker = new GestureTracker();
  const { actions } = run(tracker, 0, V_SIGN_HOLD_MS - 150, PEACE);
  assert.equal(actions.filter(([, a]) => a.type === "voice-toggle").length, 0);
});

test("releasing and re-showing the V-sign toggles a second time", () => {
  const tracker = new GestureTracker();
  const first = run(tracker, 0, V_SIGN_HOLD_MS + 100, PEACE);
  assert.equal(first.actions.filter(([, a]) => a.type === "voice-toggle").length, 1);
  const firedAt = first.actions[0][0];
  run(tracker, firedAt + 33, firedAt + GRACE_MS + 200, POINT); // release: back to plain pointing, long enough to clear the grace period
  const second = run(tracker, firedAt + GRACE_MS + 300, firedAt + GRACE_MS + V_SIGN_HOLD_MS + 500, PEACE);
  assert.equal(second.actions.filter(([, a]) => a.type === "voice-toggle").length, 1, "a fresh hold fires again");
});

test("voiceAnchor keeps the last pointer position even after the dot has fully faded, for the V-sign to pin to", () => {
  const tracker = new GestureTracker();
  run(tracker, 0, POINT_HOLD_MS + 100, POINT);
  const p = POINT();
  const afterFade = run(tracker, POINT_HOLD_MS + 133, POINT_HOLD_MS + 100 + GRACE_MS + POINTER_FADE_MS + 200, () => null);
  assert.equal(afterFade.state.pointer, null, "the dot itself is gone");
  assert.ok(afterFade.state.voiceAnchor, "but the anchor survives");
  assert.ok(
    Math.abs(afterFade.state.voiceAnchor!.u - p[8].x) < 1e-6 && Math.abs(afterFade.state.voiceAnchor!.v - p[8].y) < 1e-6,
    "at the last place the host pointed",
  );
});

test("voiceAnchor is null until the host has pointed at least once", () => {
  const tracker = new GestureTracker();
  const { state } = run(tracker, 0, V_SIGN_HOLD_MS + 100, PEACE);
  assert.equal(state.voiceAnchor, null);
});

test("a held open palm resets once", () => {
  const tracker = new GestureTracker();
  const { actions } = run(tracker, 0, PALM_HOLD_MS + 1500, PALM);
  const resets = actions.filter(([, a]) => a.type === "reset");
  assert.equal(resets.length, 1);
  assert.ok(resets[0][0] >= PALM_HOLD_MS);
});

test("after a zoom or reset there is a cooldown", () => {
  const tracker = new GestureTracker();
  const first = run(tracker, 0, PINCH_HOLD_MS + 100, PINCH);
  const zoomAt = first.actions.find(([, a]) => a.type === "zoom")?.[0] as number;
  assert.ok(zoomAt !== undefined);
  // Straight into a palm: the hold is over almost immediately but the cooldown holds the reset back.
  const second = run(tracker, zoomAt + 100, zoomAt + COOLDOWN_MS + 700, PALM);
  const reset = second.actions.find(([, a]) => a.type === "reset");
  assert.ok(reset, "reset still happens");
  assert.ok(reset[0] >= zoomAt + COOLDOWN_MS, `reset at ${reset[0]} came before the cooldown ended (${zoomAt + COOLDOWN_MS})`);
});

test("fingertip maps to the output through the ghost's placement, mirroring and panel crop", () => {
  const ghost = { x: 100, y: 200, width: 400, height: 300, mirror: false, crop: null };
  assert.deepEqual(cameraToOutput(0, 0, ghost), { x: 100, y: 200 });
  assert.deepEqual(cameraToOutput(1, 1, ghost), { x: 500, y: 500 });
  assert.deepEqual(cameraToOutput(0.25, 0.5, ghost), { x: 200, y: 350 });
  const mirrored = { ...ghost, mirror: true };
  assert.deepEqual(cameraToOutput(0.25, 0.5, mirrored), { x: 400, y: 350 });
  assert.deepEqual(cameraToOutput(0, 0, mirrored), { x: 500, y: 200 }, "left of the camera is the right of the mirrored ghost");
  const panel = { ...ghost, crop: { x: 0.25, y: 0, width: 0.5, height: 1 } };
  const centre = cameraToOutput(0.5, 0.5, panel);
  assert.ok(Math.abs(centre.x - 300) < 1e-9 && Math.abs(centre.y - 350) < 1e-9, "the crop's centre is the panel's centre");
  const left = cameraToOutput(0.25, 0, panel);
  assert.ok(Math.abs(left.x - 100) < 1e-9, "the crop's left edge is the panel's left edge");
});

test("zoom goes 2x toward the point, keeps it under the hand, and never leaves the screen", () => {
  const view = new ScreenViewport();
  assert.deepEqual(view.rect(0), { x: 0, y: 0, width: 1, height: 1 });
  assert.equal(view.zoomIn(0, 0.5, 0.5), true);
  const done = view.rect(ZOOM_GLIDE_MS);
  assert.ok(Math.abs(done.width - 1 / ZOOM) < 1e-9);
  assert.ok(Math.abs(done.x - 0.25) < 1e-9 && Math.abs(done.y - 0.25) < 1e-9, "centre pinch zooms about the centre");
  // The pinched point stays where it is on screen: source = origin + o * size, with o = the pinch position.
  const corner = new ScreenViewport();
  corner.zoomIn(0, 0.9, 0.1);
  const r = corner.rect(ZOOM_GLIDE_MS);
  assert.ok(Math.abs(r.x + 0.9 * r.width - 0.9) < 1e-9 && Math.abs(r.y + 0.1 * r.height - 0.1) < 1e-9);
  for (const [px, py] of [[0, 0], [1, 1], [1, 0], [0, 1], [-0.3, 1.4]]) {
    const v = new ScreenViewport();
    v.zoomIn(0, px, py);
    const rect = v.rect(ZOOM_GLIDE_MS);
    assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= 1 + 1e-9 && rect.y + rect.height <= 1 + 1e-9, `${px},${py}`);
  }
});

test("zooming glides over about 400 ms and a second zoom while zoomed does nothing", () => {
  const view = new ScreenViewport();
  view.zoomIn(1000, 0.5, 0.5);
  const mid = view.rect(1000 + ZOOM_GLIDE_MS / 2);
  assert.ok(mid.width < 1 && mid.width > 0.5);
  assert.equal(view.rect(1000).width, 1);
  assert.equal(view.zoomIn(2000, 0.1, 0.1), false);
});

test("panning drags the content with the hand and stops at the screen's edges", () => {
  const view = new ScreenViewport();
  view.zoomIn(0, 0.5, 0.5);
  const start = view.rect(ZOOM_GLIDE_MS);
  view.pan(0.1, 0); // hand moves right by 10% of the screen: content follows, so the view moves left
  const moved = view.rect(ZOOM_GLIDE_MS);
  assert.ok(Math.abs(moved.x - (start.x - 0.05)) < 1e-9);
  view.pan(5, 5);
  const edge = view.rect(ZOOM_GLIDE_MS);
  assert.equal(edge.x, 0);
  assert.equal(edge.y, 0);
  view.pan(-50, -50);
  const far = view.rect(ZOOM_GLIDE_MS);
  assert.ok(Math.abs(far.x + far.width - 1) < 1e-9 && Math.abs(far.y + far.height - 1) < 1e-9);
  const flat = new ScreenViewport();
  flat.pan(0.3, 0.3);
  assert.deepEqual(flat.rect(0), { x: 0, y: 0, width: 1, height: 1 }, "no panning at 1x");
});

test("reset glides back to the whole screen", () => {
  const view = new ScreenViewport();
  view.zoomIn(0, 0.8, 0.8);
  view.rect(ZOOM_GLIDE_MS);
  view.reset(1000);
  assert.ok(view.rect(1000 + ZOOM_GLIDE_MS / 2).width > 0.5);
  assert.deepEqual(view.rect(1000 + ZOOM_GLIDE_MS), { x: 0, y: 0, width: 1, height: 1 });
  assert.equal(view.zoomed, false);
});

test("two fingers held together start a stroke after the hold and follow the fingertip", () => {
  const tracker = new GestureTracker();
  let state = run(tracker, 0, PEN_HOLD_MS - 100, PEN).state;
  assert.equal(state.pen, null, "too early");
  state = run(tracker, PEN_HOLD_MS - 67, PEN_HOLD_MS + 300, PEN).state;
  const p = PEN();
  assert.ok(state.pen && Math.abs(state.pen.u - p[8].x) < 1e-6 && Math.abs(state.pen.v - p[8].y) < 1e-6);
  assert.equal(state.label, "drawing");
  const moved = hand(["ext", "ext", "curl", "curl"], { ox: 0.15 });
  const first = tracker.update(PEN_HOLD_MS + 333, moved).pen as { u: number };
  assert.ok(first.u > p[8].x && first.u < moved[8].x, "smoothed");
});

test("ending the pose (or losing the hand) ends the stroke after the grace period", () => {
  const tracker = new GestureTracker();
  run(tracker, 0, PEN_HOLD_MS + 300, PEN);
  assert.ok(tracker.update(PEN_HOLD_MS + 320, PEN()).pen);
  const gone = run(tracker, PEN_HOLD_MS + 340, PEN_HOLD_MS + 340 + GRACE_MS + 100, () => null).state;
  assert.equal(gone.pen, null);
  assert.equal(gone.label, null);
  const other = new GestureTracker();
  run(other, 0, PEN_HOLD_MS + 300, PEN);
  const changed = run(other, PEN_HOLD_MS + 320, PEN_HOLD_MS + 320 + GRACE_MS + 100, PALM).state;
  assert.equal(changed.pen, null, "a different pose ends it too");
});

test("the pen pose does not trigger pointing, zoom or reset, and a brief two-finger flash draws nothing", () => {
  const tracker = new GestureTracker();
  const { actions, state } = run(tracker, 0, 3000, PEN);
  assert.equal(actions.length, 0);
  assert.equal(state.pointer, null);
  const brief = new GestureTracker();
  const flash = run(brief, 0, PEN_HOLD_MS - 120, PEN);
  assert.equal(flash.state.pen, null);
  assert.equal(run(brief, PEN_HOLD_MS - 100, 1500, () => null).state.pen, null);
});

test("output and screen coordinates convert both ways through the current zoom view", () => {
  const whole = { x: 0, y: 0, width: 1, height: 1 };
  assert.deepEqual(outputToScreen(whole, 0.3, 0.7), { x: 0.3, y: 0.7 });
  const zoomed = { x: 0.25, y: 0.5, width: 0.5, height: 0.5 };
  assert.deepEqual(outputToScreen(zoomed, 0.5, 0.5), { x: 0.5, y: 0.75 });
  const there = outputToScreen(zoomed, 0.2, 0.9);
  const back = screenToOutput(zoomed, there.x, there.y);
  assert.ok(Math.abs(back.x - 0.2) < 1e-9 && Math.abs(back.y - 0.9) < 1e-9);
  assert.ok(screenToOutput(zoomed, 0.1, 0.1).x < 0, "content scrolled out of view lands outside the frame");
});

test("a raised fist held for the hold turns the spotlight on and it follows the middle of the hand", () => {
  const tracker = new GestureTracker();
  let state = run(tracker, 0, FIST_HOLD_MS - 100, FIST).state;
  assert.equal(state.spotlight, null, "too early");
  state = run(tracker, FIST_HOLD_MS - 67, FIST_HOLD_MS + 300, FIST).state;
  assert.deepEqual(state.spotlight, { alpha: 1 });
  assert.equal(state.label, "spotlight");
  const f = FIST();
  const centre = { u: [0, 5, 9, 13, 17].reduce((t, i) => t + f[i].x, 0) / 5, v: [0, 5, 9, 13, 17].reduce((t, i) => t + f[i].y, 0) / 5 };
  assert.ok(state.hand && Math.abs(state.hand.u - centre.u) < 1e-9 && Math.abs(state.hand.v - centre.v) < 1e-9);
  const moved = hand(["curl", "curl", "curl", "curl"], { oy: -0.3, ox: 0.2 });
  const first = tracker.update(FIST_HOLD_MS + 333, moved).hand as { u: number };
  assert.ok(first.u > centre.u && first.u < centre.u + 0.2, "smoothed, not a jump");
  const later = run(tracker, FIST_HOLD_MS + 366, FIST_HOLD_MS + 1200, () => moved).state.hand as { u: number };
  assert.ok(Math.abs(later.u - (centre.u + 0.2)) < 0.005, "and gets there");
});

test("the spotlight fades out in about half a second after the fist opens", () => {
  const tracker = new GestureTracker();
  run(tracker, 0, FIST_HOLD_MS + 300, FIST);
  const end = FIST_HOLD_MS + 333;
  const soon = run(tracker, end, end + GRACE_MS + 150, PALM).state;
  assert.ok(soon.spotlight && soon.spotlight.alpha < 1 && soon.spotlight.alpha > 0);
  const gone = run(tracker, end + GRACE_MS + 150, end + GRACE_MS + SPOTLIGHT_FADE_MS + 200, PALM).state;
  assert.equal(gone.spotlight, null);
});

test("a resting fist, a low fist or a brief clench never turns the spotlight on", () => {
  const low = new GestureTracker();
  const lowRun = run(low, 0, 5000, FIST_LOW);
  assert.equal(lowRun.state.spotlight, null);
  const brief = new GestureTracker();
  run(brief, 0, FIST_HOLD_MS - 150, FIST);
  assert.equal(run(brief, FIST_HOLD_MS - 100, 3000, () => null).state.spotlight, null);
  const flicker = new GestureTracker();
  for (let i = 0; i < 20; i++) {
    const { state } = run(flicker, i * 600, i * 600 + 450, FIST);
    assert.equal(state.spotlight, null);
    run(flicker, i * 600 + 460, i * 600 + 599, () => null);
  }
});

test("the spotlight fist doesn't point, zoom, reset or draw", () => {
  const tracker = new GestureTracker();
  const { actions, state } = run(tracker, 0, 3000, FIST);
  assert.equal(actions.length, 0);
  assert.equal(state.pointer, null);
  assert.equal(state.pen, null);
  assert.ok(state.spotlight);
});

test("a real pinch is still a pinch when the index tip is out in front of the palm", () => {
  assert.equal(classifyPose(PINCH()).pose, "pinch");
});

/** Like run(), but the hand can change with time. */
function runAt(tracker: GestureTracker, from: number, to: number, at: (t: number) => Landmark[] | null) {
  const actions: [number, GestureAction][] = [];
  let state = tracker.update(from, at(from));
  for (let t = from; t <= to; t += 33) {
    state = tracker.update(t, at(t));
    for (const a of state.actions) actions.push([t, a]);
  }
  return { actions, state };
}
const reactionsOf = (actions: [number, GestureAction][]) => actions.filter(([, a]) => a.type === "reaction").map(([t, a]) => [t, (a as { kind: string }).kind] as const);

test("classifies thumbs up and thumbs down, not confused with a fist", () => {
  assert.equal(classifyPose(THUMBS_UP()).pose, "thumbsup");
  assert.equal(classifyPose(THUMBS_DOWN()).pose, "thumbsdown");
  assert.equal(classifyPose(FIST()).pose, "fist", "a raised fist with the thumb tucked is still a fist");
  const sideways = hand(["curl", "curl", "curl", "curl"]);
  sideways[4] = { x: 0.2, y: 0.7 };
  assert.equal(classifyPose(sideways).pose, "none", "a thumb sticking out sideways is neither");
  const open = THUMBS_UP();
  open[8] = { x: open[8].x, y: 0.4 }; // index finger out too
  assert.notEqual(classifyPose(open).pose, "thumbsup", "thumb up with a finger out isn't a thumbs-up");
});

test("a held thumbs up reacts once, after the hold, and a lingering thumb does not repeat", () => {
  const tracker = new GestureTracker();
  const { actions } = run(tracker, 0, THUMB_HOLD_MS + 8000, THUMBS_UP);
  const reactions = reactionsOf(actions);
  assert.equal(reactions.length, 1);
  assert.equal(reactions[0][1], "thumbsup");
  assert.ok(reactions[0][0] >= THUMB_HOLD_MS);
  const down = new GestureTracker();
  assert.deepEqual(reactionsOf(run(down, 0, THUMB_HOLD_MS + 500, THUMBS_DOWN).actions).map(([, k]) => k), ["thumbsdown"]);
});

test("a thumb shown briefly does nothing", () => {
  const tracker = new GestureTracker();
  const { actions } = run(tracker, 0, THUMB_HOLD_MS - 150, THUMBS_UP);
  assert.equal(reactionsOf(actions).length, 0);
  assert.equal(reactionsOf(run(tracker, THUMB_HOLD_MS - 100, 3000, () => null).actions).length, 0);
});

test("after a reaction there is a cooldown, and a hold that finishes during it is used up", () => {
  const tracker = new GestureTracker();
  const first = runAt(tracker, 0, THUMB_HOLD_MS + 200, () => THUMBS_UP());
  const at = reactionsOf(first.actions)[0][0];
  // Drop the thumb, then straight into thumbs down: its hold completes inside the cooldown, so it is dropped.
  const t1 = at + 300;
  runAt(tracker, t1, t1 + 100, () => null);
  const during = runAt(tracker, t1 + 133, t1 + 133 + THUMB_HOLD_MS + 500, () => THUMBS_DOWN());
  assert.equal(reactionsOf(during.actions).length, 0, "blocked by the cooldown");
  // Keep holding it past the cooldown: still nothing (the hold was used up).
  const after = runAt(tracker, t1 + 133 + THUMB_HOLD_MS + 533, at + REACTION_COOLDOWN_MS + 2000, () => THUMBS_DOWN());
  assert.equal(reactionsOf(after.actions).length, 0);
  // A fresh thumb after the cooldown reacts.
  const t2 = at + REACTION_COOLDOWN_MS + 2100;
  runAt(tracker, t2, t2 + 300, () => null);
  const fresh = runAt(tracker, t2 + 333, t2 + 333 + THUMB_HOLD_MS + 200, () => THUMBS_UP());
  assert.equal(reactionsOf(fresh.actions).length, 1);
});

test("the wave detector needs enough back-and-forth over enough travel", () => {
  const sweeps = (n: number, amplitude: number, periodMs = 500) => {
    const samples: { t: number; x: number }[] = [];
    for (let t = 0; t <= n * periodMs / 2; t += 33) samples.push({ t, x: 0.5 + amplitude * Math.sin((2 * Math.PI * t) / periodMs) });
    return samples;
  };
  const wave = sweeps(8, 0.06);
  assert.equal(detectWave(wave, wave[wave.length - 1].t), true);
  const small = sweeps(8, 0.01);
  assert.equal(detectWave(small, small[small.length - 1].t), false, "too little travel (tremor)");
  const one = sweeps(2, 0.06);
  assert.equal(detectWave(one, one[one.length - 1].t), false, "a single swipe is not a wave");
  const drift = Array.from({ length: 40 }, (_, i) => ({ t: i * 33, x: 0.2 + i * 0.01 }));
  assert.equal(detectWave(drift, 39 * 33), false, "steady movement one way is not a wave");
  assert.equal(detectWave(wave, wave[wave.length - 1].t + WAVE_WINDOW_MS + 1), false, "old samples don't count");
});

test("waving an open hand reacts with a wave and does not reset the zoom", () => {
  const tracker = new GestureTracker();
  const { actions } = runAt(tracker, 0, 3000, WAVING);
  assert.equal(reactionsOf(actions).length >= 1, true);
  assert.equal(reactionsOf(actions)[0][1], "wave");
  assert.equal(actions.filter(([, a]) => a.type === "reset").length, 0, "a waving hand isn't still");
  assert.equal(reactionsOf(actions).length, 1, "one reaction per wave, however long it lasts");
});

test("a still open palm still resets and shows no wave", () => {
  const tracker = new GestureTracker();
  const { actions } = run(tracker, 0, PALM_HOLD_MS + 1500, PALM);
  assert.equal(actions.filter(([, a]) => a.type === "reset").length, 1);
  assert.equal(reactionsOf(actions).length, 0);
});

test("ordinary hand movement while talking triggers no reaction", () => {
  const tracker = new GestureTracker();
  const drift = (t: number) => hand(["half", "half", "curl", "half"], { ox: 0.05 * Math.sin(t / 700) });
  assert.equal(reactionsOf(runAt(tracker, 0, 20_000, drift).actions).length, 0);
  const open = new GestureTracker();
  // A hand slowly drifting across while open (one sweep, not a wave).
  const sweep = (t: number) => hand(["ext", "ext", "ext", "ext"], { ox: -0.1 + t * 0.00004 });
  assert.equal(reactionsOf(runAt(open, 0, 4000, sweep).actions).length, 0);
});

test("the indicator shows the reaction for a moment", () => {
  const tracker = new GestureTracker();
  const { state, actions } = run(tracker, 0, THUMB_HOLD_MS + 100, THUMBS_UP);
  assert.equal(reactionsOf(actions).length, 1);
  assert.equal(state.label, "thumbsup");
  const later = run(tracker, THUMB_HOLD_MS + 133, THUMB_HOLD_MS + 4000, () => null).state;
  assert.equal(later.label, null);
});

/** The "L": index out, other fingers curled, thumb held out to the side at a right angle to the index (knuckle at 0.45, 0.7; hand size 0.2). */
function shapeHand(thumb: Landmark = { x: 0.25, y: 0.68 }, opts: { ox?: number } = {}): Landmark[] {
  const h = hand(["ext", "curl", "curl", "curl"], opts);
  h[4] = { x: thumb.x + (opts.ox ?? 0), y: thumb.y };
  return h;
}
const SHAPE = () => shapeHand();
const KNUCKLE = { x: 0.45, y: 0.7 };
/** A thumb `length` (fraction of the 0.2 hand size) from the index knuckle, at `deg` degrees from the index finger's direction (straight up). */
const thumbAt = (length: number, deg: number): Landmark => ({
  x: KNUCKLE.x - Math.sin((deg * Math.PI) / 180) * length * 0.2,
  y: KNUCKLE.y - Math.cos((deg * Math.PI) / 180) * length * 0.2,
});

test("the L (index out, thumb held square to it) is the shape pose, and a plain point is still a point", () => {
  assert.equal(classifyPose(SHAPE()).pose, "shape");
  assert.equal(classifyPose(POINT()).pose, "point", "a relaxed pointing thumb is not an L");
  const tucked = POINT();
  tucked[4] = { x: 0.47, y: 0.72 };
  assert.equal(classifyPose(tucked).pose, "point", "a tucked thumb is not an L");
});

test("the L needs the thumb clearly out: just inside the margin is a point, just past it is a shape", () => {
  assert.equal(classifyPose(shapeHand(thumbAt(SHAPE_THUMB_OUT_RATIO - 0.1, 90))).pose, "point");
  assert.equal(classifyPose(shapeHand(thumbAt(SHAPE_THUMB_OUT_RATIO + 0.1, 90))).pose, "shape");
});

test("the L needs the thumb roughly square to the index: a thumb along the finger or at 45 degrees is a point", () => {
  const limit = (Math.acos(SHAPE_MAX_COS) * 180) / Math.PI;
  assert.ok(limit > 50 && limit < 60, "about 55 degrees from the finger's line");
  assert.equal(classifyPose(shapeHand(thumbAt(1.3, 0))).pose, "point", "thumb straight along the index");
  assert.equal(classifyPose(shapeHand(thumbAt(1.3, 45))).pose, "point", "thumb at 45 degrees");
  assert.equal(classifyPose(shapeHand(thumbAt(1.3, limit + 5))).pose, "shape");
  assert.equal(classifyPose(shapeHand(thumbAt(1.3, 90))).pose, "shape");
  assert.equal(classifyPose(shapeHand(thumbAt(1.3, 180 - limit - 5))).pose, "shape", "and a thumb pointing down-and-out is fine too");
  assert.equal(classifyPose(shapeHand(thumbAt(1.3, 180))).pose, "point", "thumb straight back along the finger");
});

test("the L is not a pinch, the pen, or a thumbs-up, and closing the thumb onto the index makes it a pinch", () => {
  assert.equal(classifyPose(PEN()).pose, "pen", "two fingers together is still the pen");
  const withMiddle = hand(["ext", "ext", "curl", "curl"]);
  withMiddle[4] = { x: 0.25, y: 0.68 };
  assert.equal(classifyPose(withMiddle).pose, "pen", "an L with the middle finger out too is still the pen");
  const closing = SHAPE();
  closing[4] = { x: closing[8].x + 0.01, y: closing[8].y + 0.01 };
  assert.equal(classifyPose(closing).pose, "pinch", "thumb touching the index tip is a pinch");
  assert.equal(classifyPose(THUMBS_UP()).pose, "thumbsup");
  assert.equal(classifyPose(PALM()).pose, "palm");
});

test("the L holds for a moment, then a shape follows the fingertip until the pose ends", () => {
  const tracker = new GestureTracker();
  let state = run(tracker, 0, SHAPE_HOLD_MS - 100, SHAPE).state;
  assert.equal(state.shape, null, "too early");
  state = run(tracker, SHAPE_HOLD_MS - 67, SHAPE_HOLD_MS + 300, SHAPE).state;
  const h = SHAPE();
  assert.ok(state.shape && Math.abs(state.shape.u - h[8].x) < 1e-6 && Math.abs(state.shape.v - h[8].y) < 1e-6, "starts at the fingertip");
  assert.equal(state.label, "shape");
  assert.equal(state.pen, null, "not the pen");
  const moved = shapeHand(undefined, { ox: 0.15 });
  const next = tracker.update(SHAPE_HOLD_MS + 333, moved).shape as { u: number };
  assert.ok(next.u > h[8].x && next.u < moved[8].x, "smoothed towards the new fingertip");
  const gone = run(tracker, SHAPE_HOLD_MS + 360, SHAPE_HOLD_MS + 360 + GRACE_MS + 100, () => null).state;
  assert.equal(gone.shape, null);
  assert.equal(gone.label, null);
});

test("a different pose ends the shape, and a brief L on the way to another pose draws nothing", () => {
  const tracker = new GestureTracker();
  run(tracker, 0, SHAPE_HOLD_MS + 300, SHAPE);
  const changed = run(tracker, SHAPE_HOLD_MS + 320, SHAPE_HOLD_MS + 320 + GRACE_MS + 100, PALM).state;
  assert.equal(changed.shape, null);
  const brief = new GestureTracker();
  const flash = run(brief, 0, SHAPE_HOLD_MS - 120, SHAPE);
  assert.equal(flash.state.shape, null);
  assert.equal(run(brief, SHAPE_HOLD_MS - 100, 1500, () => null).state.shape, null);
});

test("the L does not trigger the laser, zoom or reset", () => {
  const tracker = new GestureTracker();
  const { actions, state } = run(tracker, 0, 3000, SHAPE);
  assert.equal(actions.length, 0);
  assert.equal(state.pointer, null);
});

test("two fingers still draw with the pen, and the L never shows as the pen", () => {
  const tracker = new GestureTracker();
  const { state } = run(tracker, 0, PEN_HOLD_MS + 400, PEN);
  assert.ok(state.pen);
  assert.equal(state.shape, null);
});

const ERASER = () => hand(["ext", "ext", "ext", "curl"]);

test("three fingers together (pinky curled) is the eraser, and the neighbouring poses are unchanged", () => {
  assert.equal(classifyPose(ERASER()).pose, "eraser");
  assert.equal(classifyPose(PEN()).pose, "pen", "two fingers together is still the pen");
  assert.equal(classifyPose(POINT()).pose, "point");
  assert.equal(classifyPose(PALM()).pose, "palm", "four fingers out is a palm, not the eraser");
  assert.equal(classifyPose(SHAPE()).pose, "shape", "the L is unchanged");
  assert.equal(classifyPose(PINCH()).pose, "pinch");
});

test("the eraser needs the fingers together and the pinky curled", () => {
  assert.equal(classifyPose(hand(["ext", "ext", "ext", "curl"], { apart: true })).pose, "none", "a fan of three fingers is nothing");
  assert.equal(classifyPose(hand(["ext", "ext", "ext", "half"])).pose, "none", "a half-curled pinky is nothing");
  const wideRing = hand(["ext", "ext", "ext", "curl"]);
  wideRing[16] = { x: wideRing[16].x + 0.05, y: wideRing[16].y };
  assert.equal(classifyPose(wideRing).pose, "none", "ring finger held away from the middle finger is nothing");
  const wideMiddle = hand(["ext", "ext", "ext", "curl"]);
  wideMiddle[12] = { x: wideMiddle[12].x + 0.03, y: wideMiddle[12].y };
  wideMiddle[16] = { x: wideMiddle[16].x + 0.06, y: wideMiddle[16].y };
  assert.equal(classifyPose(wideMiddle).pose, "none", "middle finger held away from the index is nothing");
});

test("the eraser reports the middle fingertip", () => {
  const h = ERASER();
  assert.deepEqual(classifyPose(h).middleTip, h[12]);
});

test("three fingers held start erasing after the hold, centred on the middle fingertip, until the pose ends", () => {
  const tracker = new GestureTracker();
  let state = run(tracker, 0, ERASER_HOLD_MS - 100, ERASER).state;
  assert.equal(state.eraser, null, "too early");
  state = run(tracker, ERASER_HOLD_MS - 67, ERASER_HOLD_MS + 300, ERASER).state;
  const h = ERASER();
  assert.ok(state.eraser && Math.abs(state.eraser.u - h[12].x) < 1e-6 && Math.abs(state.eraser.v - h[12].y) < 1e-6);
  assert.equal(state.label, "erasing");
  assert.equal(state.pen, null);
  assert.equal(state.shape, null);
  const moved = hand(["ext", "ext", "ext", "curl"], { ox: 0.15 });
  const next = tracker.update(ERASER_HOLD_MS + 333, moved).eraser as { u: number };
  assert.ok(next.u > h[12].x && next.u < moved[12].x, "smoothed towards the new fingertip");
  const gone = run(tracker, ERASER_HOLD_MS + 360, ERASER_HOLD_MS + 360 + GRACE_MS + 100, () => null).state;
  assert.equal(gone.eraser, null);
  assert.equal(gone.label, null);
});

test("a brief flash of the eraser pose erases nothing, and a different pose ends it", () => {
  const brief = new GestureTracker();
  assert.equal(run(brief, 0, ERASER_HOLD_MS - 120, ERASER).state.eraser, null);
  const tracker = new GestureTracker();
  run(tracker, 0, ERASER_HOLD_MS + 300, ERASER);
  assert.equal(run(tracker, ERASER_HOLD_MS + 320, ERASER_HOLD_MS + 320 + GRACE_MS + 100, PALM).state.eraser, null);
});

test("the eraser does not trigger the laser, zoom, reset, the pen or a shape", () => {
  const tracker = new GestureTracker();
  const { actions, state } = run(tracker, 0, 3000, ERASER);
  assert.equal(actions.length, 0);
  assert.equal(state.pointer, null);
  assert.equal(state.pen, null);
  assert.equal(state.shape, null);
  assert.ok(state.eraser);
  const pen = run(new GestureTracker(), 0, 3000, PEN).state;
  assert.equal(pen.eraser, null, "two fingers never erase");
});

// --- Highlighter: the "horns" (index and pinky out, middle and ring curled) ---
const HORNS = () => hand(["ext", "curl", "curl", "ext"]);

test("the horns (index and pinky out, middle and ring curled) are the highlighter pose, and the neighbouring poses are unchanged", () => {
  assert.equal(classifyPose(HORNS()).pose, "horns");
  assert.equal(classifyPose(POINT()).pose, "point", "index only is still the laser");
  assert.equal(classifyPose(PEN()).pose, "pen", "index and middle together is still the pen");
  assert.equal(classifyPose(PEACE()).pose, "v", "a peace sign is still the V");
  assert.equal(classifyPose(ERASER()).pose, "eraser", "three fingers is still the eraser");
  assert.equal(classifyPose(SHAPE()).pose, "shape", "the L is unchanged");
  assert.equal(classifyPose(PALM()).pose, "palm");
  assert.equal(classifyPose(FIST()).pose, "fist", "a raised fist is not the horns");
  assert.equal(classifyPose(PINCH()).pose, "pinch");
  assert.equal(classifyPose(MIDPINCH()).pose, "midpinch");
});

test("the horns need the middle and ring curled and both outer fingers out", () => {
  assert.equal(classifyPose(hand(["ext", "curl", "curl", "curl"])).pose, "point", "no pinky is just pointing");
  assert.equal(classifyPose(hand(["curl", "curl", "curl", "ext"])).pose, "none", "pinky alone is nothing");
  assert.equal(classifyPose(hand(["ext", "ext", "curl", "ext"])).pose, "none", "middle finger out too is nothing");
  assert.equal(classifyPose(hand(["ext", "curl", "ext", "ext"])).pose, "none", "ring finger out too is nothing");
  assert.equal(classifyPose(hand(["ext", "half", "curl", "ext"])).pose, "none", "a half-curled middle finger is nothing");
});

test("the horns with the thumb tucked over the curled fingers are not read as a stamp pinch", () => {
  assert.equal(classifyPose(hand(["ext", "curl", "curl", "ext"], { midpinch: true })).pose, "horns");
});

test("the horns held start highlighting after the hold, at the index fingertip, until the pose ends", () => {
  const tracker = new GestureTracker();
  let state = run(tracker, 0, HIGHLIGHT_HOLD_MS - 100, HORNS).state;
  assert.equal(state.highlight, null, "too early");
  state = run(tracker, HIGHLIGHT_HOLD_MS - 67, HIGHLIGHT_HOLD_MS + 300, HORNS).state;
  const h = HORNS();
  assert.ok(state.highlight && Math.abs(state.highlight.u - h[8].x) < 1e-6 && Math.abs(state.highlight.v - h[8].y) < 1e-6);
  assert.equal(state.label, "highlighting");
  const gone = run(tracker, HIGHLIGHT_HOLD_MS + 340, HIGHLIGHT_HOLD_MS + 340 + GRACE_MS + 100, () => null).state;
  assert.equal(gone.highlight, null);
  assert.equal(gone.label, null);
});

test("a brief flash of the horns highlights nothing, and the horns do nothing else", () => {
  const brief = new GestureTracker();
  assert.equal(run(brief, 0, HIGHLIGHT_HOLD_MS - 120, HORNS).state.highlight, null);
  const tracker = new GestureTracker();
  const { actions, state } = run(tracker, 0, 3000, HORNS);
  assert.equal(actions.length, 0);
  assert.equal(state.pointer, null);
  assert.equal(state.pen, null);
  assert.equal(state.shape, null);
  assert.equal(state.eraser, null);
  assert.ok(state.highlight);
});
