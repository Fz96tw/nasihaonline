import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COOLDOWN_MS,
  GRACE_MS,
  GestureTracker,
  PALM_HOLD_MS,
  PINCH_HOLD_MS,
  POINTER_FADE_MS,
  POINT_HOLD_MS,
  cameraToOutput,
  classifyPose,
  type GestureAction,
  type Landmark,
} from "./gestures.ts";
import { ScreenViewport, ZOOM, ZOOM_GLIDE_MS } from "./screen-zoom.ts";

type Finger = "ext" | "curl" | "half";

/** A right-side-up hand with the wrist at the bottom; `ox` shifts it sideways. Fingers: index, middle, ring, pinky. */
function hand(fingers: [Finger, Finger, Finger, Finger], opts: { pinch?: boolean; ox?: number; oy?: number } = {}): Landmark[] {
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
    const x = columns[i] + ox - 0.05;
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
  return points;
}

const POINT = () => hand(["ext", "curl", "curl", "curl"]);
const PINCH = () => hand(["curl", "curl", "curl", "curl"], { pinch: true });
const PALM = () => hand(["ext", "ext", "ext", "ext"]);
const TALK = () => hand(["half", "half", "curl", "half"]);

test("classifies pointing, pinching and an open palm", () => {
  assert.equal(classifyPose(POINT()).pose, "point");
  assert.equal(classifyPose(PINCH()).pose, "pinch");
  assert.equal(classifyPose(PALM()).pose, "palm");
  assert.equal(classifyPose(hand(["curl", "curl", "curl", "curl"])).pose, "none", "a fist is nothing");
  assert.equal(classifyPose(hand(["ext", "ext", "curl", "curl"])).pose, "none", "a peace sign is nothing");
  assert.equal(classifyPose(TALK()).pose, "none", "half-curled talking hands are nothing");
});

test("a hand only partly in frame, or too small, is not classified", () => {
  assert.equal(classifyPose(hand(["ext", "curl", "curl", "curl"], { ox: 0.55 })).pose, "none");
  assert.equal(classifyPose(hand(["ext", "curl", "curl", "curl"], { oy: -0.5 })).pose, "none");
  assert.equal(classifyPose(POINT().slice(0, 10)).pose, "none");
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
  const shapes = [TALK, () => hand(["curl", "curl", "curl", "curl"]), () => hand(["ext", "ext", "curl", "curl"]), TALK];
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
