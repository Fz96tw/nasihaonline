import { test } from "node:test";
import assert from "node:assert/strict";
import { FADE_MS, HOLD_MS, MAX_POINTS, StrokeBoard } from "./drawing.ts";

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
  board.add(0.5, 0.5);
  assert.equal(board.pointCount, 0, "adding after clear does nothing until a new stroke begins");
});

test("starting a new stroke ends the previous one", () => {
  const board = new StrokeBoard();
  board.begin(0, "red");
  board.add(0.1, 0.1);
  board.begin(50, "red");
  assert.equal(board.visible(50 + HOLD_MS + FADE_MS - 1).length, 2);
  assert.equal(board.visible(50 + HOLD_MS + FADE_MS).length, 1, "the first ended at 50 and is gone; the new one is still open");
});

test("total points are capped, dropping the oldest strokes first", () => {
  const board = new StrokeBoard();
  for (let s = 0; s < 8; s++) {
    board.begin(s, "red");
    for (let i = 0; i < 400; i++) board.add(0.05 + s * 0.1, 0.01 + i * 0.0025);
    board.end(s);
  }
  assert.ok(board.pointCount <= MAX_POINTS, `${board.pointCount}`);
  const shown = board.visible(100);
  assert.ok(shown.length < 8 && shown.length >= 4, "oldest strokes were dropped");
  assert.ok(shown[shown.length - 1].stroke.points.length === 400, "the newest is intact");
});

test("a single endless stroke is trimmed from its oldest end rather than growing", () => {
  const board = new StrokeBoard();
  board.begin(0, "red");
  for (let i = 0; i < MAX_POINTS * 2; i++) board.add((i % 500) * 0.0021, Math.floor(i / 500) * 0.01);
  assert.ok(board.pointCount <= MAX_POINTS);
  assert.equal(board.drawing, true);
});
