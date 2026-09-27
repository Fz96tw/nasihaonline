import { test } from "node:test";
import assert from "node:assert/strict";
import { FADE_MS, HOLD_MS, MAX_POINTS, MAX_POINTS_PER_GUEST, MAX_PINNED, MAX_TEXT_LENGTH, MIN_ARROW_LENGTH, MIN_SHAPE_SIZE, StrokeBoard, arrowHead, cleanShapeText, shapeBounds, strokeColor } from "./drawing.ts";

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

test("each guest draws a stroke of their own, next to the presenter's, in their own colour", () => {
  const board = new StrokeBoard();
  board.begin(0, "red");
  board.begin(0, "#22d3ee", "guest-a");
  board.begin(0, "#a3e635", "guest-b");
  board.add(0.1, 0.1);
  board.add(0.5, 0.5, "guest-a");
  board.add(0.9, 0.9, "guest-b");
  assert.equal(board.drawing, true, "the presenter is still drawing");
  assert.deepEqual(board.drawingOwners.sort(), ["guest-a", "guest-b", "host"]);
  const shown = board.visible(0);
  assert.equal(shown.length, 3);
  assert.deepEqual(shown.map(({ stroke }) => stroke.owner).sort(), ["guest-a", "guest-b", "host"]);
  assert.equal(shown.find(({ stroke }) => stroke.owner === "guest-a")?.stroke.color, "#22d3ee");
  // Ending one guest's stroke leaves the others going.
  board.end(100, "guest-a");
  assert.equal(board.isDrawing("guest-a"), false);
  assert.equal(board.isDrawing("guest-b"), true);
  assert.equal(board.drawing, true);
  // A guest's finished stroke holds and fades like the presenter's.
  assert.equal(board.visible(100 + HOLD_MS).find(({ stroke }) => stroke.owner === "guest-a")?.alpha, 1);
  assert.equal(board.visible(100 + HOLD_MS + FADE_MS).find(({ stroke }) => stroke.owner === "guest-a"), undefined);
});

test("a guest starting a new stroke ends their own previous one only", () => {
  const board = new StrokeBoard();
  board.begin(0, "red");
  board.begin(0, "#22d3ee", "guest-a");
  board.add(0.5, 0.5, "guest-a");
  board.begin(50, "#22d3ee", "guest-a");
  const first = board.visible(60).filter(({ stroke }) => stroke.owner === "guest-a");
  assert.equal(first.length, 2);
  assert.equal(first[0].stroke.endedAt, 50);
  assert.equal(board.isDrawing(), true, "the presenter's stroke is untouched");
});

test("one guest can't exhaust the shared point cap: they keep only their newest points", () => {
  const board = new StrokeBoard();
  board.begin(0, "red");
  for (let i = 0; i < 300; i++) board.add(0.001 * (i % 10) + 0.1, 0.005 * i);
  board.begin(0, "#22d3ee", "guest-a");
  for (let i = 0; i < MAX_POINTS * 2; i++) board.add((i % 100) / 100, Math.floor(i / 100) / 50, "guest-a");
  assert.ok(board.pointsOf("guest-a") <= MAX_POINTS_PER_GUEST, `guest kept ${board.pointsOf("guest-a")}`);
  assert.ok(board.pointsOf("guest-a") > 0);
  assert.ok(MAX_POINTS_PER_GUEST < MAX_POINTS);
  assert.equal(board.pointsOf("host"), 300, "the presenter's strokes are untouched by a guest's scribble");
  assert.ok(board.pointCount <= MAX_POINTS);
});

test("a guest's older strokes are dropped first when they go over their share", () => {
  const board = new StrokeBoard();
  board.begin(0, "#22d3ee", "guest-a");
  for (let i = 0; i < 300; i++) board.add(i / 300, 0.1, "guest-a");
  board.end(10, "guest-a");
  board.begin(20, "#22d3ee", "guest-a");
  for (let i = 0; i < 300; i++) board.add(i / 300, 0.9, "guest-a");
  assert.ok(board.pointsOf("guest-a") <= MAX_POINTS_PER_GUEST);
  const strokes = board.visible(30).map(({ stroke }) => stroke);
  const current = strokes.find((stroke) => stroke.endedAt === null);
  assert.equal(current?.points.length, 300, "the stroke being drawn keeps its newest points");
});

test("Clear drawing removes the presenter's and every guest's strokes at once", () => {
  const board = new StrokeBoard();
  board.begin(0, "red");
  board.add(0.2, 0.2);
  board.begin(0, "#22d3ee", "guest-a");
  board.add(0.4, 0.4, "guest-a");
  board.end(10, "guest-a");
  board.clear();
  assert.deepEqual(board.visible(20), []);
  assert.equal(board.drawing, false);
  assert.deepEqual(board.drawingOwners, []);
  // Points added after a clear, with no stroke begun, go nowhere.
  board.add(0.3, 0.3, "guest-a");
  assert.equal(board.pointCount, 0);
});

test("strokeColor resolves the presenter's pen names and passes a guest's colour through", () => {
  assert.equal(strokeColor("red"), "#ff3030");
  assert.equal(strokeColor("#22d3ee"), "#22d3ee");
});

test("an arrow keeps only its tail and the latest fingertip position", () => {
  const board = new StrokeBoard();
  board.begin(0, "red", undefined, "arrow");
  board.add(0.1, 0.1);
  assert.equal(board.visible(0)[0].stroke.points.length, 1, "just the tail until the fingertip moves");
  board.add(0.2, 0.2);
  board.add(0.3, 0.5);
  board.add(0.6, 0.4);
  const [arrow] = board.visible(0);
  assert.equal(arrow.stroke.kind, "arrow");
  assert.deepEqual(arrow.stroke.points, [{ x: 0.1, y: 0.1 }, { x: 0.6, y: 0.4 }]);
  assert.equal(board.pointCount, 2, "however long the gesture, an arrow costs two points");
});

test("a finished arrow holds and fades like any stroke", () => {
  const board = new StrokeBoard();
  board.begin(0, "green", undefined, "arrow");
  board.add(0.1, 0.1);
  board.add(0.5, 0.5);
  board.end(1000);
  assert.equal(board.visible(1000 + HOLD_MS)[0].alpha, 1);
  assert.ok(Math.abs(board.visible(1000 + HOLD_MS + FADE_MS / 2)[0].alpha - 0.5) < 1e-9);
  assert.equal(board.visible(1000 + HOLD_MS + FADE_MS).length, 0);
});

test("an arrow shorter than the minimum is discarded when finished, a long enough one is kept", () => {
  const board = new StrokeBoard();
  board.begin(0, "red", undefined, "arrow");
  board.add(0.5, 0.5);
  board.add(0.5 + MIN_ARROW_LENGTH / 2, 0.5);
  board.end(100);
  assert.equal(board.visible(100).length, 0, "a twitch leaves nothing behind");
  assert.equal(board.drawing, false);

  board.begin(200, "red", undefined, "arrow");
  board.add(0.5, 0.5);
  board.add(0.5 + MIN_ARROW_LENGTH * 2, 0.5);
  board.end(300);
  assert.equal(board.visible(300).length, 1);

  board.begin(400, "red", undefined, "arrow");
  board.add(0.2, 0.2);
  board.end(500);
  assert.equal(board.visible(500).length, 1, "a tail with no head yet is dropped, the earlier arrow stays");
});

test("freehand strokes are unchanged and clear() removes arrows too", () => {
  const board = new StrokeBoard();
  board.begin(0, "red");
  board.add(0.1, 0.1);
  board.add(0.2, 0.2);
  board.add(0.3, 0.3);
  assert.equal(board.visible(0)[0].stroke.kind, "free");
  assert.equal(board.pointCount, 3);
  board.end(10);
  board.begin(20, "yellow", undefined, "arrow");
  board.add(0.4, 0.4);
  board.add(0.8, 0.8);
  board.end(30);
  assert.equal(board.visible(30).length, 2);
  board.clear();
  assert.equal(board.visible(30).length, 0);
});

test("a guest's stroke can be an arrow too and is owned by that guest", () => {
  const board = new StrokeBoard();
  board.begin(0, "#00aaff", "guest-1", "arrow");
  board.add(0.1, 0.1, "guest-1");
  board.add(0.5, 0.5, "guest-1");
  assert.equal(board.pointsOf("guest-1"), 2);
  assert.equal(board.drawing, false, "not the host's pen");
});

test("arrowHead puts two barbs behind the tip, symmetric about the shaft", () => {
  const tip = { x: 10, y: 0 };
  const [a, b] = arrowHead({ x: 0, y: 0 }, tip, 2);
  assert.ok(a.x < tip.x && b.x < tip.x, "barbs sit behind the tip");
  assert.ok(Math.abs(a.y + b.y) < 1e-9, "mirror images across the shaft");
  assert.ok(a.y !== b.y);
  assert.ok(Math.abs(Math.hypot(a.x - tip.x, a.y - tip.y) - 2) < 1e-9, "barb length is the size given");
});

test("arrowHead barbs turn with the direction of the arrow", () => {
  const tip = { x: 0, y: 10 };
  const [a, b] = arrowHead({ x: 0, y: 0 }, tip, 2);
  assert.ok(a.y < tip.y && b.y < tip.y, "pointing down, the barbs sit above the tip");
  assert.ok(Math.abs(a.x + b.x) < 1e-9);
});

test("arrowHead keeps true angles when the points are fractions of a wide screen", () => {
  const aspect = 16 / 9;
  const tip = { x: 0.5, y: 0.5 };
  const [a] = arrowHead({ x: 0.1, y: 0.5 }, tip, 0.05, aspect);
  const realLength = Math.hypot((a.x - tip.x) * aspect, a.y - tip.y);
  assert.ok(Math.abs(realLength - 0.05) < 1e-9, "the barb is 0.05 long in real (isotropic) terms");
});

test("a box or ellipse keeps only two opposite corners, whichever way it is dragged", () => {
  for (const kind of ["box", "ellipse"] as const) {
    const board = new StrokeBoard();
    board.begin(0, "red", undefined, kind);
    assert.equal(board.kindOf(), kind);
    board.add(0.6, 0.6);
    board.add(0.5, 0.4);
    board.add(0.2, 0.3);
    const [shape] = board.visible(0);
    assert.equal(shape.stroke.kind, kind);
    assert.deepEqual(shape.stroke.points, [{ x: 0.6, y: 0.6 }, { x: 0.2, y: 0.3 }]);
    assert.equal(board.pointCount, 2);
  }
});

test("shapeBounds gives the same rectangle from either diagonal", () => {
  const expected = { x: 0.2, y: 0.3, width: 0.4, height: 0.3 };
  const close = (a: { x: number; y: number; width: number; height: number }) => {
    for (const key of ["x", "y", "width", "height"] as const) assert.ok(Math.abs(a[key] - expected[key]) < 1e-9, key);
  };
  close(shapeBounds({ x: 0.6, y: 0.6 }, { x: 0.2, y: 0.3 }));
  close(shapeBounds({ x: 0.2, y: 0.3 }, { x: 0.6, y: 0.6 }));
  close(shapeBounds({ x: 0.2, y: 0.6 }, { x: 0.6, y: 0.3 }));
});

test("a shape too narrow or too short is discarded when finished, a big enough one is kept", () => {
  const board = new StrokeBoard();
  const draw = (t: number, dx: number, dy: number) => {
    board.begin(t, "red", undefined, "box");
    board.add(0.5, 0.5);
    board.add(0.5 + dx, 0.5 + dy);
    board.end(t + 10);
  };
  draw(0, MIN_SHAPE_SIZE / 2, MIN_SHAPE_SIZE * 3);
  assert.equal(board.visible(10).length, 0, "too narrow: it would be a line");
  draw(100, MIN_SHAPE_SIZE * 3, MIN_SHAPE_SIZE / 2);
  assert.equal(board.visible(110).length, 0, "too short");
  draw(200, -MIN_SHAPE_SIZE * 2, -MIN_SHAPE_SIZE * 2);
  assert.equal(board.visible(210).length, 1, "dragged up and to the left still counts");
});

test("kindOf is null when not drawing, and switching kinds starts a fresh stroke", () => {
  const board = new StrokeBoard();
  assert.equal(board.kindOf(), null);
  board.begin(0, "red", undefined, "free");
  board.add(0.1, 0.1);
  board.add(0.3, 0.3);
  board.begin(50, "red", undefined, "box");
  board.add(0.4, 0.4);
  board.add(0.6, 0.6);
  board.end(100);
  assert.equal(board.kindOf(), null);
  const kinds = board.visible(100).map(({ stroke }) => stroke.kind);
  assert.deepEqual(kinds, ["free", "box"], "the freehand stroke was finished, not replaced");
});

function pin(board: StrokeBoard, t: number, kind: "box" | "ellipse" = "box", x = 0.1) {
  board.begin(t, "red", undefined, kind);
  board.add(x, 0.1);
  board.add(x + 0.2, 0.4);
  return board.end(t + 10);
}

test("a finished box or ellipse is pinned: fully visible forever, while freehand and arrows still fade", () => {
  const board = new StrokeBoard();
  const box = pin(board, 0, "box");
  const ellipse = pin(board, 100, "ellipse", 0.5);
  assert.ok(box && ellipse, "end() hands back a kept pinned shape");
  board.begin(200, "red", undefined, "free");
  board.add(0.1, 0.1);
  board.add(0.2, 0.2);
  board.end(210);
  board.begin(220, "red", undefined, "arrow");
  board.add(0.1, 0.1);
  board.add(0.5, 0.5);
  board.end(230);
  const much = 10 * 60 * 1000;
  const later = board.visible(much);
  assert.equal(later.length, 2, "only the two pinned shapes are left");
  assert.ok(later.every(({ stroke, alpha }) => alpha === 1 && (stroke.kind === "box" || stroke.kind === "ellipse")));
});

test("end() returns nothing for strokes that aren't kept pinned shapes", () => {
  const board = new StrokeBoard();
  board.begin(0, "red", undefined, "free");
  board.add(0.1, 0.1);
  board.add(0.3, 0.3);
  assert.equal(board.end(10), null);
  board.begin(20, "red", undefined, "arrow");
  board.add(0.1, 0.1);
  board.add(0.5, 0.5);
  assert.equal(board.end(30), null);
  board.begin(40, "red", undefined, "box");
  board.add(0.5, 0.5);
  board.add(0.5 + MIN_SHAPE_SIZE / 2, 0.9);
  assert.equal(board.end(50), null, "a too-small shape is discarded, not pinned");
  assert.equal(board.pinnedShapes().length, 0);
  assert.equal(board.end(60), null, "nothing being drawn");
});

test("a shape still being drawn is not listed as pinned until it is finished", () => {
  const board = new StrokeBoard();
  board.begin(0, "red", undefined, "box");
  board.add(0.1, 0.1);
  board.add(0.4, 0.4);
  assert.deepEqual(board.pinnedShapes(), []);
  board.end(10);
  assert.equal(board.pinnedShapes().length, 1);
});

test("labels are set on a pinned shape, cleaned up, capped, and cleared with empty text", () => {
  const board = new StrokeBoard();
  const box = pin(board, 0) as { id: number };
  assert.equal(board.setText(box.id, "  Look   here\n now  "), true);
  assert.equal(board.pinnedShapes()[0].text, "Look here now");
  assert.equal(board.setText(box.id, "x".repeat(MAX_TEXT_LENGTH + 40)), true);
  assert.equal(board.pinnedShapes()[0].text.length, MAX_TEXT_LENGTH);
  assert.equal(board.setText(box.id, "   "), true);
  assert.equal(board.pinnedShapes()[0].text, "", "blank text clears the label");
  assert.equal(board.setText(9999, "nope"), false, "no such shape");
  assert.equal(cleanShapeText("a\tb\n\nc"), "a b c");
  assert.equal(cleanShapeText(""), "");
});

test("a label doesn't apply to a freehand stroke", () => {
  const board = new StrokeBoard();
  board.begin(0, "red", undefined, "free");
  board.add(0.1, 0.1);
  board.add(0.3, 0.3);
  const [free] = board.visible(0);
  board.end(10);
  assert.equal(board.setText(free.stroke.id, "hi"), false);
});

test("the version changes when pinned shapes or their labels change, and not otherwise", () => {
  const board = new StrokeBoard();
  const start = board.version;
  const box = pin(board, 0) as { id: number };
  const afterPin = board.version;
  assert.ok(afterPin > start);
  board.setText(box.id, "same");
  const afterText = board.version;
  assert.ok(afterText > afterPin);
  board.setText(box.id, "same");
  assert.equal(board.version, afterText, "setting identical text changes nothing");
  board.begin(100, "red");
  board.add(0.1, 0.1);
  board.add(0.4, 0.4);
  board.end(110);
  assert.equal(board.version, afterText, "a freehand stroke isn't a pinned shape");
  board.remove(box.id);
  assert.ok(board.version > afterText);
});

test("remove takes out one pinned shape, undoLast the newest, clear everything", () => {
  const board = new StrokeBoard();
  const a = pin(board, 0, "box", 0.05) as { id: number };
  const b = pin(board, 100, "ellipse", 0.3) as { id: number };
  const c = pin(board, 200, "box", 0.6) as { id: number };
  assert.equal(board.remove(b.id), true);
  assert.equal(board.remove(b.id), false, "already gone");
  assert.deepEqual(board.pinnedShapes().map((shape) => shape.id), [a.id, c.id]);
  assert.equal(board.undoLast(), c.id, "undo removes the most recent");
  assert.deepEqual(board.pinnedShapes().map((shape) => shape.id), [a.id]);
  assert.equal(board.undoLast(), a.id);
  assert.equal(board.undoLast(), null, "nothing left to undo");
  pin(board, 300);
  board.begin(400, "red");
  board.add(0.1, 0.1);
  board.add(0.3, 0.3);
  board.clear();
  assert.equal(board.visible(400).length, 0, "clear removes pinned shapes and strokes alike");
  assert.deepEqual(board.pinnedShapes(), []);
});

test("at most MAX_PINNED shapes are kept, the oldest dropped first", () => {
  const board = new StrokeBoard();
  const ids: number[] = [];
  for (let i = 0; i < MAX_PINNED + 3; i++) ids.push((pin(board, i * 100, "box", 0.01 * (i % 20)) as { id: number }).id);
  const kept = board.pinnedShapes().map((shape) => shape.id);
  assert.equal(kept.length, MAX_PINNED);
  assert.deepEqual(kept, ids.slice(3), "the three oldest are gone");
});

test("a long freehand scribble can't push a pinned shape off the board", () => {
  const board = new StrokeBoard();
  pin(board, 0);
  board.begin(100, "red", undefined, "free");
  for (let i = 0; i < MAX_POINTS + 500; i++) board.add(0.1 + (i % 700) * 0.001, 0.5 + Math.floor(i / 700) * 0.01);
  board.end(200);
  assert.equal(board.pinnedShapes().length, 1);
  assert.ok(board.pointCount <= MAX_POINTS + 2);
});

test("a pinned shape drawn while another is pending doesn't disturb it, and both keep their own text", () => {
  const board = new StrokeBoard();
  const first = pin(board, 0, "box", 0.05) as { id: number };
  const second = pin(board, 100, "ellipse", 0.5) as { id: number };
  board.setText(first.id, "one");
  board.setText(second.id, "two");
  assert.deepEqual(board.pinnedShapes().map((shape) => shape.text), ["one", "two"]);
});
