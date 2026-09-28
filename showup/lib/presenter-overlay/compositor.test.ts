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

test("a group that fits is anchored to position like a lone ghost, placed adjacently in order", () => {
  // Small (PiP-scale) group: well under the frame width either way.
  const left = layoutGhosts([16 / 9, 16 / 9], 1000, 500, 0.3, "left");
  assert.equal(left[0].x, 0, "first ghost starts at the left edge");
  assert.equal(left[1].x, left[0].width, "second ghost sits right after the first, no gap");

  const right = layoutGhosts([16 / 9, 16 / 9], 1000, 500, 0.3, "right");
  const totalWidthRight = right[0].width + right[1].width;
  assert.ok(Math.abs(right[1].x + right[1].width - 1000) < 1e-6, "last ghost ends flush with the right edge");
  assert.ok(Math.abs(right[0].x - (1000 - totalWidthRight)) < 1e-6, "whole block starts exactly totalWidth from the right edge");

  const centre = layoutGhosts([1, 1, 1], 900, 500, 0.3, "center");
  const totalWidthCentre = centre.reduce((sum, box) => sum + box.width, 0);
  assert.ok(Math.abs(centre[0].x - (900 - totalWidthCentre) / 2) < 1e-6, "whole block is centred, not each ghost individually");
  assert.equal(centre[1].x, centre[0].x + centre[0].width);
  assert.equal(centre[2].x, centre[1].x + centre[1].width);
});

test("a group that doesn't fit falls back to spreading evenly across the whole width", () => {
  // scale 1 with wide 16:9 cameras: the group is wider than the frame, so it can't be anchored as a block.
  const boxes = layoutGhosts([16 / 9, 16 / 9], 1000, 500, 1, "right");
  const totalWidth = boxes[0].width + boxes[1].width;
  assert.ok(totalWidth > 1000, "sanity check: this group doesn't fit");
  // Block-anchoring by "right" would start the first box at outputWidth - totalWidth, which is negative here
  // (never happens once the block is spread instead) — the actual box must not match that formula.
  assert.notEqual(boxes[0].x, 1000 - totalWidth);
  // Matches the pre-existing (unchanged) even-slot-with-clamp formula exactly.
  const count = boxes.length;
  boxes.forEach((box, index) => {
    const centre = (1000 * (index + 0.5)) / count;
    const expectedX = box.width >= 1000 ? (1000 - box.width) / 2 : Math.min(Math.max(centre - box.width / 2, 0), 1000 - box.width);
    assert.ok(Math.abs(box.x - expectedX) < 1e-9, `box ${index} matches the pre-existing spread formula`);
  });
});

test("omitting featuredIndex leaves span+group behavior unchanged", () => {
  assert.deepEqual(
    layoutGhosts([1, 1], 1000, 500, 1, "left", true, [1, 1.2]),
    layoutGhosts([1, 1], 1000, 500, 1, "left", false, [1, 1.2]),
    "span is still a no-op for a group when featuredIndex isn't given",
  );
});

test("the featured ghost cover-fits the frame exactly like the lone-span case, ignoring scale and zoom", () => {
  const [aloneWide] = layoutGhosts([16 / 9], 2000, 500, 0.3, "left", true);
  const group = layoutGhosts([16 / 9, 1], 2000, 500, 0.3, "left", true, [5, 5], 0);
  assert.deepEqual(group[0], aloneWide, "featured box matches the lone-span box for the same aspect, regardless of scale/zoom");

  const [aloneTall] = layoutGhosts([1], 500, 2000, 1, "center", true);
  const groupTall = layoutGhosts([16 / 9, 1], 500, 2000, 1, "center", true, [], 1);
  assert.deepEqual(groupTall[1], aloneTall, "works with the featured ghost at any index");
});

test("non-featured ghosts render small and anchored by position while one ghost is featured", () => {
  const left = layoutGhosts([1, 1, 1], 1000, 500, 1, "left", true, [], 0);
  // box 0 is featured (covers the frame); boxes 1 and 2 are the small secondary ghosts.
  assert.ok(left[0].height >= 500, "featured ghost still covers the frame");
  assert.ok(left[1].height < left[0].height * 0.5, "secondary ghost is much smaller than the featured one");
  assert.equal(left[1].x, 0, "secondary block starts at the left edge, same anchor rule as the main group");
  assert.equal(left[2].x, left[1].x + left[1].width, "secondary ghosts sit adjacently, in order");

  const right = layoutGhosts([1, 1, 1], 1000, 500, 1, "right", true, [], 1);
  // box 1 is featured here; boxes 0 and 2 are secondary.
  assert.ok(Math.abs(right[2].x + right[2].width - 1000) < 1e-6, "secondary block ends flush with the right edge");

  // A secondary ghost's size doesn't grow with `scale` — it stays small regardless.
  const smallScale = layoutGhosts([1, 1], 1000, 500, 0.3, "left", true, [], 0);
  const largeScale = layoutGhosts([1, 1], 1000, 500, 1, "left", true, [], 0);
  assert.equal(smallScale[1].height, largeScale[1].height, "secondary size is independent of the scale setting");
});
