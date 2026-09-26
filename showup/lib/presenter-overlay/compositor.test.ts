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
