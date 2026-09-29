import { test } from "node:test";
import assert from "node:assert/strict";
import { DARK_LUMINANCE, HIGHLIGHT_ALPHA_MULTIPLY, HIGHLIGHT_ALPHA_SCREEN, HIGHLIGHT_HEIGHT, averageLuminance, bandRect, highlightStyle, lockedToStartY } from "./highlight.ts";
import { FADE_MS, HOLD_MS, MAX_PINNED, StrokeBoard } from "./drawing.ts";

const px = (r: number, g: number, b: number, a = 255) => [r, g, b, a];

test("averageLuminance: white is 1, black is 0, transparent pixels are ignored, nothing counts as light", () => {
  assert.ok(Math.abs(averageLuminance([...px(255, 255, 255), ...px(255, 255, 255)]) - 1) < 1e-9);
  assert.equal(averageLuminance(px(0, 0, 0)), 0);
  assert.ok(Math.abs(averageLuminance([...px(255, 255, 255), ...px(0, 0, 0)]) - 0.5) < 1e-9);
  assert.ok(Math.abs(averageLuminance([...px(0, 0, 0, 0), ...px(255, 255, 255)]) - 1) < 1e-9, "a transparent pixel doesn't dilute the average");
  assert.equal(averageLuminance([]), 1);
});

test("highlightStyle multiplies over light content and screens over dark content", () => {
  assert.deepEqual(highlightStyle(1), { blend: "multiply", alpha: HIGHLIGHT_ALPHA_MULTIPLY });
  assert.deepEqual(highlightStyle(DARK_LUMINANCE), { blend: "multiply", alpha: HIGHLIGHT_ALPHA_MULTIPLY });
  assert.deepEqual(highlightStyle(DARK_LUMINANCE - 0.01), { blend: "screen", alpha: HIGHLIGHT_ALPHA_SCREEN });
  assert.deepEqual(highlightStyle(0), { blend: "screen", alpha: HIGHLIGHT_ALPHA_SCREEN });
  assert.ok(HIGHLIGHT_ALPHA_MULTIPLY >= 0.4 && HIGHLIGHT_ALPHA_MULTIPLY <= 0.5, "translucent enough for the content to show through");
});

test("bandRect is a flat band centred on the start line, whichever way the hand travels", () => {
  const right = bandRect({ x: 0.2, y: 0.5 }, { x: 0.6, y: 0.5 }, HIGHLIGHT_HEIGHT);
  assert.equal(right.x, 0.2);
  assert.equal(right.y, 0.5 - HIGHLIGHT_HEIGHT / 2);
  assert.ok(Math.abs(right.width - 0.4) < 1e-9);
  assert.equal(right.height, HIGHLIGHT_HEIGHT);
  const left = bandRect({ x: 0.6, y: 0.5 }, { x: 0.2, y: 0.5 }, HIGHLIGHT_HEIGHT);
  assert.deepEqual(left, right, "dragging right to left gives the same band");
  assert.ok(HIGHLIGHT_HEIGHT > 0.015 && HIGHLIGHT_HEIGHT < 0.03, "about one line of text");
});

test("lockedToStartY follows the fingertip's x but stays on the start line", () => {
  assert.deepEqual(lockedToStartY(null, { x: 0.3, y: 0.4 }), { x: 0.3, y: 0.4 }, "the first sample sets the line");
  assert.deepEqual(lockedToStartY({ x: 0.3, y: 0.4 }, { x: 0.7, y: 0.45 }), { x: 0.7, y: 0.4 });
});

function draw(board: StrokeBoard, from: number, to: number, y = 0.4, now = 0) {
  board.begin(now, "yellow", "host", "highlight");
  board.add(from, y);
  board.add(to, y);
  return board.currentId()!;
}

test("a highlight fades like freehand: held, then faded out and dropped", () => {
  const board = new StrokeBoard();
  const id = draw(board, 0.2, 0.6);
  board.end(10);
  assert.equal(board.visible(10 + HOLD_MS - 1)[0].alpha, 1);
  const fading = board.visible(10 + HOLD_MS + FADE_MS / 2)[0];
  assert.ok(fading.alpha > 0 && fading.alpha < 1);
  assert.equal(board.visible(10 + HOLD_MS + FADE_MS + 1).length, 0);
  assert.deepEqual(board.pinnedShapes(), [], `unpinned highlight ${id} isn't in the shapes list`);
});

test("a highlight shorter than a twitch is dropped", () => {
  const board = new StrokeBoard();
  draw(board, 0.2, 0.205);
  board.end(10);
  assert.equal(board.visible(20).length, 0);
});

test("a pinned highlight never fades, is listed, and can be removed or undone", () => {
  const board = new StrokeBoard();
  const id = draw(board, 0.2, 0.6);
  board.end(10);
  const before = board.version;
  assert.equal(board.pin(id), true);
  assert.ok(board.version > before, "the UI is told");
  assert.equal(board.visible(10 + HOLD_MS + FADE_MS + 60000)[0].alpha, 1);
  assert.deepEqual(board.pinnedShapes(), [{ id, kind: "highlight", text: "" }]);
  assert.equal(board.remove(id), true);
  assert.equal(board.visible(0).length, 0);
  const second = draw(board, 0.1, 0.3, 0.5, 100);
  board.end(110);
  board.pin(second);
  assert.equal(board.undoLast(), second);
});

test("pinned highlights count toward MAX_PINNED, oldest dropped", () => {
  const board = new StrokeBoard();
  const ids: number[] = [];
  for (let i = 0; i < MAX_PINNED + 2; i++) {
    ids.push(draw(board, 0.1, 0.5, 0.1 + i * 0.03, i));
    board.end(i + 1);
    board.pin(ids[i]);
  }
  const listed = board.pinnedShapes().map((shape) => shape.id);
  assert.equal(listed.length, MAX_PINNED);
  assert.ok(!listed.includes(ids[0]) && !listed.includes(ids[1]), "the two oldest went");
});

test("the eraser wipes a highlight anywhere along the band, pinned or not", () => {
  const board = new StrokeBoard();
  const fading = draw(board, 0.2, 0.6);
  board.end(10);
  assert.equal(board.eraseAt(0.4, 0.4, 0.035, 16 / 9), 1, "the middle of the band");
  assert.equal(board.visible(20).length, 0);
  const pinned = draw(board, 0.2, 0.6, 0.4, 30);
  board.end(31);
  board.pin(pinned);
  const before = board.version;
  assert.equal(board.eraseAt(0.55, 0.41, 0.035, 16 / 9), 1);
  assert.ok(board.version > before, "erasing a pinned highlight updates the list");
  assert.deepEqual(board.pinnedShapes(), []);
  void fading;
});

test("clear removes highlights and tells the UI when a pinned one goes", () => {
  const board = new StrokeBoard();
  const id = draw(board, 0.2, 0.6);
  board.end(10);
  board.pin(id);
  const before = board.version;
  board.clear();
  assert.ok(board.version > before);
  assert.equal(board.visible(20).length, 0);
});
