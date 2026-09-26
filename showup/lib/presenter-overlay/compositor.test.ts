import { test } from "node:test";
import assert from "node:assert/strict";
import { fitBox, layoutGhosts } from "./compositor.ts";

const ratio = (b: { width: number; height: number }) => b.width / b.height;

test("landscape, portrait and 4:3 cameras keep their real aspect ratio", () => {
  assert.ok(Math.abs(ratio(fitBox(1280, 720)) - 16 / 9) < 0.01);
  assert.ok(Math.abs(ratio(fitBox(720, 1280)) - 9 / 16) < 0.01, "a portrait phone stays portrait");
  assert.ok(Math.abs(ratio(fitBox(640, 480)) - 4 / 3) < 0.01);
  assert.ok(Math.abs(ratio(fitBox(1080, 1920)) - 9 / 16) < 0.01);
});

test("cameras are fitted inside the segmentation box, never enlarged past it", () => {
  for (const [w, h] of [[1280, 720], [720, 1280], [640, 480], [3840, 2160]]) {
    const box = fitBox(w, h);
    assert.ok(box.width <= 640 && box.height <= 360, `${w}x${h} -> ${box.width}x${box.height}`);
  }
});

test("one ghost follows the position setting", () => {
  const [box] = layoutGhosts([16 / 9], 1000, 500, 0.5, "left");
  assert.equal(box.x, 0);
  const [right] = layoutGhosts([16 / 9], 1000, 500, 0.5, "right");
  assert.ok(Math.abs(right.x + right.width - 1000) < 1e-6);
});

test("several ghosts are spaced along the bottom in the order given, inside the frame", () => {
  for (const count of [2, 3]) {
    const boxes = layoutGhosts(Array(count).fill(9 / 16), 1600, 900, 1, "left");
    for (let i = 0; i < count; i++) {
      assert.ok(boxes[i].x >= 0 && boxes[i].x + boxes[i].width <= 1600, "inside the frame");
      if (i > 0) assert.ok(boxes[i].x > boxes[i - 1].x, "left to right in the order added");
    }
    const gaps = boxes.slice(1).map((box, i) => box.x - boxes[i].x);
    assert.ok(gaps.every((gap) => Math.abs(gap - gaps[0]) < 1e-6), "evenly spaced");
  }
});

test("a group is drawn smaller than a lone ghost", () => {
  const [alone] = layoutGhosts([1], 1000, 500, 1, "center");
  const [grouped] = layoutGhosts([1, 1, 1], 1000, 500, 1, "center");
  assert.ok(grouped.height < alone.height);
});

test("span makes a lone ghost cover the frame, whichever edge needs the larger scale", () => {
  // Wide share, 16:9 camera: scaled to the share's width, taller than the frame (head cropped).
  const [wide] = layoutGhosts([16 / 9], 2000, 500, 0.5, "left", true);
  assert.ok(Math.abs(wide.width - 2000) < 1e-6 && Math.abs(wide.x) < 1e-6);
  assert.ok(wide.height > 500);
  // Tall share: scaled to the share's height, wider than the frame, centred.
  const [tall] = layoutGhosts([16 / 9], 500, 2000, 0.5, "left", true);
  assert.equal(tall.height, 2000);
  assert.ok(Math.abs(tall.x + tall.width / 2 - 250) < 1e-6);
  // Same shape as the camera: exactly the frame.
  const [same] = layoutGhosts([16 / 9], 1600, 900, 0.5, "left", true);
  assert.ok(Math.abs(same.width - 1600) < 1e-6 && Math.abs(same.height - 900) < 1e-6);
});

test("span leaves a group's layout alone", () => {
  assert.deepEqual(layoutGhosts([1, 1], 1000, 500, 1, "left", true), layoutGhosts([1, 1], 1000, 500, 1, "left", false));
});

test("zoom scales a ghost about its bottom edge and keeps its anchor", () => {
  const [plain] = layoutGhosts([1], 1000, 500, 1, "left");
  const [zoomed] = layoutGhosts([1], 1000, 500, 1, "left", false, [1.5]);
  assert.equal(zoomed.height, plain.height * 1.5);
  assert.equal(zoomed.width, plain.width * 1.5);
  assert.equal(zoomed.x, 0, "left anchor stays at the left edge");
  const [right] = layoutGhosts([1], 1000, 500, 1, "right", false, [1.5]);
  assert.equal(right.x + right.width, 1000, "right anchor stays at the right edge");
  const [centre] = layoutGhosts([1], 1000, 500, 1, "center", false, [2]);
  assert.ok(Math.abs(centre.x + centre.width / 2 - 500) < 1e-9, "stays centred even when wider than the frame");
});

test("zoom of 1 or no zooms leaves the layout as it was, and span ignores zoom", () => {
  assert.deepEqual(layoutGhosts([1, 1], 1000, 500, 1, "left", false, [1, 1]), layoutGhosts([1, 1], 1000, 500, 1, "left"));
  assert.deepEqual(layoutGhosts([16 / 9], 2000, 500, 1, "left", true, [2]), layoutGhosts([16 / 9], 2000, 500, 1, "left", true));
});

test("each ghost in a group gets its own zoom", () => {
  const [a, b] = layoutGhosts([1, 1], 1000, 500, 1, "left", false, [1, 1.4]);
  assert.ok(Math.abs(b.height / a.height - 1.4) < 1e-9);
});
