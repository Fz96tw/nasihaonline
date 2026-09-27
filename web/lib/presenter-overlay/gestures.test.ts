import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COOLDOWN_MS,
  GRACE_MS,
  GestureTracker,
  PALM_HOLD_MS,
  PEN_HOLD_MS,
  PINCH_HOLD_MS,
  POINTER_FADE_MS,
  POINT_HOLD_MS,
  cameraToOutput,
  classifyPose,
  type Landmark,
} from "./gestures.ts";

type Finger = "ext" | "curl" | "half";

/** A right-side-up hand with the wrist at the bottom; `ox`/`oy` shift it. Fingers: index, middle, ring, pinky. */
function hand(fingers: [Finger, Finger, Finger, Finger], opts: { pinch?: boolean; ox?: number; oy?: number; apart?: boolean } = {}): Landmark[] {
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

const POINT = (opts: { ox?: number; oy?: number } = {}) => hand(["ext", "curl", "curl", "curl"], opts);
// A pinch holds the fingertips out in front of the palm (the index finger only half curled).
const PINCH = () => hand(["half", "curl", "curl", "curl"], { pinch: true });
const PALM = (opts: { ox?: number; oy?: number } = {}) => hand(["ext", "ext", "ext", "ext"], opts);
const PEN = (opts: { ox?: number; oy?: number } = {}) => hand(["ext", "ext", "curl", "curl"], opts);
const PEACE = () => hand(["ext", "ext", "curl", "curl"], { apart: true });

test("classifyPose reads point, pinch, pen and palm", () => {
  assert.equal(classifyPose(POINT()).pose, "point");
  assert.equal(classifyPose(PINCH()).pose, "pinch");
  assert.equal(classifyPose(PEN()).pose, "pen");
  assert.equal(classifyPose(PALM()).pose, "palm");
});

test("a peace sign (fingers apart) is not the pen pose", () => {
  assert.equal(classifyPose(PEACE()).pose, "none");
});

test("a hand only partly in frame, or too small, reads as none", () => {
  const offscreen = POINT();
  offscreen[8] = { x: 1.001, y: 0.5 };
  assert.equal(classifyPose(offscreen).pose, "none");
  const tiny = POINT().map((p) => ({ x: 0.5 + (p.x - 0.5) * 0.05, y: 0.9 + (p.y - 0.9) * 0.05 }));
  assert.equal(classifyPose(tiny).pose, "none");
});

test("cameraToOutput maps a camera-frame point through the ghost's placement, with and without mirroring", () => {
  const ghost = { x: 100, y: 50, width: 200, height: 400, mirror: false };
  assert.deepEqual(cameraToOutput(0.25, 0.5, ghost), { x: 150, y: 250 });
  const mirrored = { ...ghost, mirror: true };
  assert.deepEqual(cameraToOutput(0.25, 0.5, mirrored), { x: 250, y: 250 });
});

test("the laser pointer needs POINT_HOLD_MS held, then fades out after pointing stops", () => {
  const tracker = new GestureTracker();
  assert.equal(tracker.update(0, POINT()).pointer, null, "not yet — the hold hasn't elapsed");
  const state = tracker.update(POINT_HOLD_MS, POINT());
  assert.ok(state.pointer, "pointer shows once held long enough");
  assert.equal(state.label, "pointing");
  const ended = tracker.update(POINT_HOLD_MS + GRACE_MS + 1, null);
  assert.ok(ended.pointer && ended.pointer.fade < 1, "fading, not gone instantly");
  const gone = tracker.update(POINT_HOLD_MS + GRACE_MS + 1 + POINTER_FADE_MS, null);
  assert.equal(gone.pointer, null);
});

test("a short gap in tracking (under GRACE_MS) doesn't restart the pointer's hold", () => {
  const tracker = new GestureTracker();
  tracker.update(0, POINT());
  tracker.update(GRACE_MS / 2, null); // one dropped frame
  const state = tracker.update(POINT_HOLD_MS, POINT());
  assert.ok(state.pointer, "the hold survived the gap");
});

test("the pen pose starts a stroke after PEN_HOLD_MS and follows the fingertip", () => {
  const tracker = new GestureTracker();
  tracker.update(0, PEN());
  assert.equal(tracker.update(PEN_HOLD_MS - 1, PEN()).pen, null);
  const state = tracker.update(PEN_HOLD_MS, PEN());
  assert.ok(state.pen);
  assert.equal(state.label, "drawing");
  const ended = tracker.update(PEN_HOLD_MS + GRACE_MS + 1, null);
  assert.equal(ended.pen, null, "the stroke ends once the pen pose ends (no fade, unlike the pointer)");
});

test("a pinch held for PINCH_HOLD_MS fires one zoom action, then pans while it's held", () => {
  const tracker = new GestureTracker();
  tracker.update(0, PINCH());
  const zoomed = tracker.update(PINCH_HOLD_MS, PINCH());
  assert.deepEqual(
    zoomed.actions.map((a) => a.type),
    ["zoom"],
  );
  assert.equal(zoomed.label, "zooming");
  // Still pinching a moment later: pans, doesn't zoom again.
  const panning = tracker.update(PINCH_HOLD_MS + 50, PINCH());
  assert.deepEqual(
    panning.actions.map((a) => a.type),
    ["pan"],
  );
});

test("nothing zooms again during the cooldown after a zoom", () => {
  const tracker = new GestureTracker();
  tracker.update(0, PINCH());
  tracker.update(PINCH_HOLD_MS, PINCH());
  // Release, then pinch again immediately — still within COOLDOWN_MS of the first zoom.
  tracker.update(PINCH_HOLD_MS + GRACE_MS + 1, null);
  tracker.update(PINCH_HOLD_MS + GRACE_MS + 2, PINCH());
  const again = tracker.update(PINCH_HOLD_MS + GRACE_MS + 2 + PINCH_HOLD_MS, PINCH());
  assert.ok(PINCH_HOLD_MS + GRACE_MS + 2 + PINCH_HOLD_MS < PINCH_HOLD_MS + COOLDOWN_MS, "sanity: still inside the cooldown window");
  assert.deepEqual(again.actions, []);
});

test("an open palm held still for PALM_HOLD_MS resets the zoom, once", () => {
  const tracker = new GestureTracker();
  tracker.update(0, PALM());
  const reset = tracker.update(PALM_HOLD_MS, PALM());
  assert.deepEqual(
    reset.actions.map((a) => a.type),
    ["reset"],
  );
  assert.equal(reset.label, "reset");
  // Still holding the palm: doesn't fire again.
  const again = tracker.update(PALM_HOLD_MS + 100, PALM());
  assert.deepEqual(again.actions, []);
});

test("a moving hand never triggers the palm reset", () => {
  const tracker = new GestureTracker();
  // Drifts sideways well past STILL_LIMIT over the hold window.
  for (let t = 0; t <= PALM_HOLD_MS; t += 50) {
    tracker.update(t, PALM({ ox: (t / PALM_HOLD_MS) * 0.2 }));
  }
  const state = tracker.update(PALM_HOLD_MS, PALM({ ox: 0.2 }));
  assert.deepEqual(state.actions, []);
});
