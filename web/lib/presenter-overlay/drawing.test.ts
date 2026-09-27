import { test } from "node:test";
import assert from "node:assert/strict";
import { FADE_MS, HOLD_MS, MAX_POINTS, StrokeBoard, strokeColor } from "./drawing.ts";

test("a stroke collects points while drawing and stays fully visible", () => {
  const board = new StrokeBoard();
  board.begin(0, "red");
  board.add(0.1, 0.1);
  board.add(0.2, 0.2);
  assert.equal(board.drawing, true);
  const [only] = board.visible(5000);
  assert.equal(only.alpha, 1, "still being drawn, however long it takes");
  assert.equal(only.stroke.points.length, 2);
});

test("points too close to the last one are skipped", () => {
  const board = new StrokeBoard();
  board.begin(0, "red");
  board.add(0.1, 0.1);
  board.add(0.1005, 0.1);
  assert.equal(board.pointCount, 1);
});

test("a finished stroke holds, then fades out about 3 seconds after it ended, and is removed", () => {
  const board = new StrokeBoard();
  board.begin(0, "yellow");
  board.add(0.1, 0.1);
  board.add(0.3, 0.3);
  board.end(1000);
  assert.equal(board.drawing, false);
  assert.equal(board.visible(1000 + HOLD_MS)[0].alpha, 1);
  const fading = board.visible(1000 + HOLD_MS + FADE_MS / 2)[0];
  assert.ok(Math.abs(fading.alpha - 0.5) < 1e-9);
  assert.equal(board.visible(1000 + HOLD_MS + FADE_MS).length, 0, "gone after ~3 s");
  assert.equal(board.pointCount, 0);
});

test("each stroke fades on its own clock", () => {
  const board = new StrokeBoard();
  board.begin(0, "red");
  board.add(0.1, 0.1);
  board.end(0);
  board.begin(2500, "green");
  board.add(0.5, 0.5);
  board.end(2500);
  const shown = board.visible(3500);
  assert.equal(shown.length, 1);
  assert.equal(shown[0].stroke.color, "green");
});

test("clear removes everything at once, even a stroke being drawn", () => {
  const board = new StrokeBoard();
  board.begin(0, "red");
  board.add(0.1, 0.1);
  board.end(10);
  board.begin(20, "red");
  board.add(0.4, 0.4);
  board.clear();
  assert.equal(board.visible(30).length, 0);
  assert.equal(board.drawing, false);
});

test("beginning a new stroke ends whatever was being drawn", () => {
  const board = new StrokeBoard();
  board.begin(0, "red");
  board.add(0.1, 0.1);
  board.begin(50, "green");
  assert.equal(board.drawing, true);
  const shown = board.visible(50);
  assert.equal(shown.length, 2);
  assert.equal(shown[0].stroke.color, "red");
  assert.equal(shown[0].stroke.endedAt, 50);
});

test("the total point cap trims the oldest points first", () => {
  const board = new StrokeBoard();
  board.begin(0, "red");
  // Spacing well above MIN_STEP so no point is skipped as "too close to the last one".
  for (let i = 0; i < MAX_POINTS + 50; i++) board.add(i * 0.01, i * 0.01);
  assert.equal(board.pointCount, MAX_POINTS);
  // A very long single stroke still in progress is trimmed in place, not dropped.
  assert.equal(board.drawing, true);
});

test("strokeColor resolves a pen name and passes through anything else unchanged", () => {
  assert.equal(strokeColor("red"), "#ff3030");
  assert.equal(strokeColor("#abcdef"), "#abcdef");
});
