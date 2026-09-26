import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEADZONE,
  DWELL_MS,
  WindowSmoother,
  clampWindow,
  panelAspect,
  personBounds,
  targetCentre,
  tracePanelPath,
  windowSize,
  type PanelShape,
  type PathContext,
} from "./panel.ts";

const CAM_W = 640;
const CAM_H = 480;

/** A mask with a filled rectangle (fractions of the frame) as the person. */
function mask(width: number, height: number, box: { l: number; r: number; t: number; b: number } | null): Float32Array {
  const data = new Float32Array(width * height);
  if (!box) return data;
  for (let y = Math.floor(box.t * height); y < box.b * height; y++) {
    for (let x = Math.floor(box.l * width); x < box.r * width; x++) data[y * width + x] = 1;
  }
  return data;
}

test("portrait shapes take the full camera height at 3:4; the circle zooms in on head and shoulders", () => {
  for (const shape of ["rounded", "arch"] as PanelShape[]) {
    const size = windowSize(shape, CAM_W, CAM_H);
    assert.equal(size.height, CAM_H);
    assert.ok(Math.abs(size.width / size.height - panelAspect(shape)) < 1e-9);
  }
  const circle = windowSize("circle", CAM_W, CAM_H);
  assert.equal(circle.width, circle.height);
  assert.ok(circle.height < CAM_H * 0.7, "circle is zoomed in, not the whole body");
});

test("a camera narrower than 3:4 keeps its width and shortens the window", () => {
  const size = windowSize("rounded", 300, 600);
  assert.equal(size.width, 300);
  assert.equal(size.height, 400);
});

test("clampWindow centres on the target but never leaves the camera frame", () => {
  const centred = clampWindow(320, 240, 200, 100, CAM_W, CAM_H);
  assert.deepEqual(centred, { x: 220, y: 190, width: 200, height: 100 });
  const left = clampWindow(10, 240, 200, 100, CAM_W, CAM_H);
  assert.equal(left.x, 0);
  const right = clampWindow(1000, 240, 200, 100, CAM_W, CAM_H);
  assert.equal(right.x + right.width, CAM_W);
  const low = clampWindow(320, 900, 200, 100, CAM_W, CAM_H);
  assert.equal(low.y + low.height, CAM_H);
  const oversize = clampWindow(320, 240, 2000, 2000, CAM_W, CAM_H);
  assert.deepEqual(oversize, { x: 0, y: 0, width: CAM_W, height: CAM_H });
});

test("personBounds finds the person and the centre of the head, not of a raised arm", () => {
  const w = 160;
  const h = 120;
  const data = mask(w, h, { l: 0.4, r: 0.5, t: 0.1, b: 0.9 }); // body/head column
  for (let y = Math.floor(0.4 * h); y < 0.5 * h; y++) for (let x = Math.floor(0.5 * w); x < 0.9 * w; x++) data[y * w + x] = 1; // arm out to the right
  const bounds = personBounds(data, w, h);
  assert.ok(bounds);
  assert.ok(Math.abs(bounds.top - 0.1) < 0.05);
  assert.ok(bounds.right > 0.85);
  assert.ok(Math.abs(bounds.headX - 0.45) < 0.05, `headX ${bounds.headX}`);
});

test("personBounds returns null for an empty or noisy mask and understands background-confidence masks", () => {
  assert.equal(personBounds(mask(160, 120, null), 160, 120), null);
  const speck = mask(160, 120, { l: 0.5, r: 0.51, t: 0.5, b: 0.51 });
  assert.equal(personBounds(speck, 160, 120), null);
  const person = mask(160, 120, { l: 0.2, r: 0.4, t: 0.2, b: 0.8 });
  const background = person.map((v) => 1 - v);
  const bounds = personBounds(background, 160, 120, false);
  assert.ok(bounds && Math.abs(bounds.left - 0.2) < 0.05);
});

test("targetCentre: centred with nobody there, follows the person's middle for portrait shapes, and the head for the circle", () => {
  assert.deepEqual(targetCentre("rounded", null, CAM_W, CAM_H), { x: 320, y: 240 });
  const person = { left: 0.6, right: 0.8, top: 0.2, bottom: 1, headX: 0.72 };
  assert.deepEqual(targetCentre("arch", person, CAM_W, CAM_H), { x: 0.7 * CAM_W, y: 240 });
  const circle = targetCentre("circle", person, CAM_W, CAM_H);
  assert.ok(Math.abs(circle.x - 0.72 * CAM_W) < 1e-9);
  // Head top sits inside the circle, near its top, so the circle's centre is a little below the head top.
  assert.ok(circle.y > person.top * CAM_H);
  assert.ok(circle.y < person.top * CAM_H + windowSize("circle", CAM_W, CAM_H).height / 2);
});

test("the window ignores small movements", () => {
  const s = new WindowSmoother(320, 240);
  const wiggle = DEADZONE * CAM_W * 0.5;
  for (let t = 0; t <= 5000; t += 50) s.update(t, 320 + (t % 200 < 100 ? wiggle : -wiggle), 240, CAM_W);
  assert.deepEqual(s.centre, { x: 320, y: 240 });
});

test("a larger shift is followed only after the dwell, then glides there without overshooting", () => {
  const s = new WindowSmoother(320, 240);
  const target = 480;
  let firstMove = -1;
  let previous = 320;
  for (let t = 0; t <= 4000; t += 50) {
    const { x } = s.update(t, target, 240, CAM_W);
    if (firstMove < 0 && x !== 320) firstMove = t;
    assert.ok(x >= previous - 1e-9 && x <= target + 1e-9, "monotonic, no overshoot");
    previous = x;
  }
  assert.ok(firstMove >= DWELL_MS, `moved at ${firstMove}, before the dwell`);
  assert.ok(Math.abs(previous - target) < 0.05 * CAM_W, "arrives near the target");
});

test("a shift that doesn't last (a gesture) is not followed", () => {
  const s = new WindowSmoother(320, 240);
  for (let t = 0; t <= 1000; t += 50) s.update(t, t < DWELL_MS - 100 ? 480 : 320, 240, CAM_W);
  assert.deepEqual(s.centre, { x: 320, y: 240 });
});

test("shape outlines stay inside their box and have the right form", () => {
  const box = { x: 10, y: 20, width: 90, height: 120 };
  for (const shape of ["rounded", "circle", "arch"] as PanelShape[]) {
    const calls: string[] = [];
    const ctx: PathContext = {
      beginPath: () => calls.push("begin"),
      moveTo: (x, y) => {
        calls.push("move");
        assert.ok(x >= box.x - 1e-9 && x <= box.x + box.width + 1e-9 && y >= box.y - 1e-9 && y <= box.y + box.height + 1e-9);
      },
      lineTo: (x, y) => {
        calls.push("line");
        assert.ok(x >= box.x - 1e-9 && x <= box.x + box.width + 1e-9 && y >= box.y - 1e-9 && y <= box.y + box.height + 1e-9);
      },
      arc: (x, y, r) => {
        calls.push("arc");
        assert.ok(x - r >= box.x - 1e-9 && x + r <= box.x + box.width + 1e-9 && y - r >= box.y - 1e-9 && y + r <= box.y + box.height + 1e-9);
      },
      arcTo: () => calls.push("arcTo"),
      closePath: () => calls.push("close"),
    };
    tracePanelPath(ctx, shape, box);
    assert.equal(calls[0], "begin");
    assert.equal(calls[calls.length - 1], "close");
    if (shape === "circle") assert.deepEqual(calls, ["begin", "arc", "close"]);
    if (shape === "arch") assert.deepEqual(calls, ["begin", "move", "line", "arc", "line", "close"]);
    if (shape === "rounded") assert.equal(calls.filter((c) => c === "arcTo").length, 4);
  }
});
