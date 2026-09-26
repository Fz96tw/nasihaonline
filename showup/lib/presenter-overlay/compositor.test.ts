import { test } from "node:test";
import assert from "node:assert/strict";
import { fitBox } from "./compositor.ts";

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
