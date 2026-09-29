import { test } from "node:test";
import assert from "node:assert/strict";
import { isStraightLine } from "./drawing.ts";
import { FADE_MS, HOLD_MS, MAX_POINTS, MAX_POINTS_PER_GUEST, ERASER_RADIUS, MAX_PINNED, MAX_TEXT_LENGTH, MIN_ARROW_LENGTH, MIN_SHAPE_SIZE, StrokeBoard, arrowHead, cleanShapeText, shapeBounds, strokeColor, takesText } from "./drawing.ts";

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

test("currentPoints reads the in-progress stroke, including a freehand one end() itself returns null for", () => {
  const board = new StrokeBoard();
  assert.equal(board.currentPoints(), null, "nothing drawn yet");
  board.begin(0, "red");
  board.add(0.1, 0.1);
  board.add(0.2, 0.3);
  assert.deepEqual(board.currentPoints(), [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.3 }]);
  assert.equal(board.end(10), null, "freehand fades, it isn't pinned — currentPoints was the only way to read its points");
  assert.equal(board.currentPoints(), null, "nothing in progress once ended");
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

test("pin() exempts a freehand stroke from fading; unpin() lets it resume, fading fresh from the given time", () => {
  const board = new StrokeBoard();
  board.begin(0, "red", undefined, "free");
  board.add(0.1, 0.1);
  board.add(0.3, 0.3);
  board.end(1000);
  const strokeId = board.visible(1000)[0].stroke.id;
  assert.equal(board.pin(strokeId), true);
  const wayLater = 1000 + HOLD_MS + FADE_MS + 5000;
  assert.equal(board.visible(wayLater).length, 1, "pinned, so it never fades");
  assert.equal(board.visible(wayLater)[0].alpha, 1);

  assert.equal(board.unpin(strokeId, wayLater), true, "unpinning at wayLater resets its fade clock to wayLater");
  assert.equal(board.visible(wayLater).length, 1, "still fully visible the instant it's unpinned");
  assert.equal(board.visible(wayLater + HOLD_MS).length, 1, "holds for HOLD_MS from the unpin time, not from when it was drawn");
  assert.equal(board.visible(wayLater + HOLD_MS + FADE_MS).length, 0, "then fades out on the usual schedule");
});

test("pin()/unpin() are no-ops on the wrong id, an already-pinned-by-kind shape, or a stroke still being drawn", () => {
  const board = new StrokeBoard();
  assert.equal(board.pin(999), false, "no such stroke");
  board.begin(0, "red", undefined, "free");
  board.add(0.1, 0.1);
  assert.equal(board.pin(1), false, "still being drawn, not yet ended");
  board.end(10);
  assert.equal(board.unpin(1, 20), false, "wasn't pinned in the first place");
  const box = pin(board, 100, "box");
  assert.equal(board.pin(box!.id), false, "a pinned-by-kind shape doesn't need pin()");
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

test("a finished arrow is pinned: it never fades", () => {
  const board = new StrokeBoard();
  board.begin(0, "green", undefined, "arrow");
  board.add(0.1, 0.1);
  board.add(0.5, 0.5);
  board.end(1000);
  const later = board.visible(1000 + 10 * 60 * 1000);
  assert.equal(later.length, 1);
  assert.equal(later[0].alpha, 1);
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

test("finished arrows, boxes and ellipses are pinned: fully visible forever, while freehand strokes still fade", () => {
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
  assert.deepEqual(later.map(({ stroke }) => stroke.kind).sort(), ["arrow", "box", "ellipse"], "only the freehand stroke is gone");
  assert.ok(later.every(({ alpha }) => alpha === 1));
});

test("end() returns the finished stroke for pinned kinds only, and nothing for freehand or a too-small mark", () => {
  const board = new StrokeBoard();
  board.begin(0, "red", undefined, "free");
  board.add(0.1, 0.1);
  board.add(0.3, 0.3);
  assert.equal(board.end(10), null, "freehand fades, it isn't pinned");
  board.begin(20, "red", undefined, "arrow");
  board.add(0.1, 0.1);
  board.add(0.5, 0.5);
  const arrowStroke = board.end(30);
  assert.ok(arrowStroke && arrowStroke.kind === "arrow", "a finished arrow is pinned");
  board.begin(40, "red", undefined, "arrow");
  board.add(0.5, 0.5);
  board.add(0.5 + MIN_ARROW_LENGTH / 2, 0.5);
  assert.equal(board.end(50), null, "a too-short arrow is discarded, not pinned");
  board.begin(60, "red", undefined, "box");
  board.add(0.5, 0.5);
  board.add(0.5 + MIN_SHAPE_SIZE / 2, 0.9);
  assert.equal(board.end(70), null, "a too-small shape is discarded, not pinned");
  assert.equal(board.pinnedShapes().length, 1);
  assert.equal(board.end(80), null, "nothing being drawn");
});

test("a Voice Pin note is pinned even when its grown bounds are narrower than MIN_SHAPE_SIZE, unlike a hand-dragged box", () => {
  const board = new StrokeBoard();
  board.begin(0, "red", undefined, "note");
  board.add(0.5, 0.5);
  board.add(0.5 + MIN_SHAPE_SIZE / 4, 0.5 + MIN_SHAPE_SIZE / 4);
  const finished = board.end(10);
  assert.ok(finished && finished.kind === "note", "grown-to-fit text isn't a hand-dragged twitch, so it's kept regardless of size");
  assert.equal(board.pinnedShapes().length, 1);
});

test("a note is pinned forever like other annotations, takes a label, and is hit-tested on its outline like a text stamp", () => {
  const board = new StrokeBoard();
  board.begin(0, "red", undefined, "note");
  board.add(0.2, 0.2);
  board.add(0.4, 0.3);
  const finished = board.end(10);
  assert.ok(finished);
  board.setText(finished!.id, "hello");
  const much = 10 * 60 * 1000;
  const shown = board.visible(much);
  assert.equal(shown.length, 1);
  assert.equal(shown[0].alpha, 1, "pinned, never fades");
  assert.equal(shown[0].stroke.text, "hello");
  assert.equal(board.eraseAt(0.2, 0.25, 0.01), 1, "touching the left edge erases it");
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

function freehand(board: StrokeBoard, t: number, points: [number, number][]) {
  board.begin(t, "red", undefined, "free");
  for (const [x, y] of points) board.add(x, y);
  board.end(t + 10);
}
function arrow(board: StrokeBoard, t: number, from: [number, number], to: [number, number]) {
  board.begin(t, "red", undefined, "arrow");
  board.add(from[0], from[1]);
  board.add(to[0], to[1]);
  board.end(t + 10);
}

test("the eraser wipes a freehand stroke it touches, anywhere along it, and leaves the rest", () => {
  const board = new StrokeBoard();
  freehand(board, 0, [[0.1, 0.1], [0.2, 0.1], [0.3, 0.1]]);
  freehand(board, 100, [[0.1, 0.8], [0.3, 0.8]]);
  assert.equal(board.eraseAt(0.2, 0.1 + ERASER_RADIUS / 2), 1, "on the segment between two points");
  assert.equal(board.visible(200).length, 1);
  assert.equal(board.eraseAt(0.6, 0.6), 0, "nothing there");
  assert.equal(board.visible(200).length, 1);
});

test("the eraser only reaches as far as its radius", () => {
  const board = new StrokeBoard();
  freehand(board, 0, [[0.2, 0.5], [0.4, 0.5]]);
  assert.equal(board.eraseAt(0.3, 0.5 + ERASER_RADIUS * 1.5), 0);
  assert.equal(board.eraseAt(0.3, 0.5 + ERASER_RADIUS * 0.9), 1);
});

test("the eraser ring is round on a wide screen: distances use the screen's aspect ratio", () => {
  const wide = new StrokeBoard();
  freehand(wide, 0, [[0.5, 0.5], [0.5, 0.5]]);
  // 16:9 - a horizontal offset of 0.03 of the width is 0.03 * 16/9 = 0.053 of the height, past the 0.035 radius.
  assert.equal(wide.eraseAt(0.53, 0.5, ERASER_RADIUS, 16 / 9), 0);
  const square = new StrokeBoard();
  freehand(square, 0, [[0.5, 0.5], [0.5, 0.5]]);
  assert.equal(square.eraseAt(0.53, 0.5, ERASER_RADIUS, 1), 1);
  const near = new StrokeBoard();
  freehand(near, 0, [[0.5, 0.5], [0.5, 0.5]]);
  assert.equal(near.eraseAt(0.51, 0.5, ERASER_RADIUS, 16 / 9), 1);
});

test("an arrow is erased where the ring crosses its line, not off to the side", () => {
  const board = new StrokeBoard();
  arrow(board, 0, [0.1, 0.1], [0.7, 0.7]);
  assert.equal(board.eraseAt(0.9, 0.2), 0);
  assert.equal(board.eraseAt(0.4, 0.4), 1);
  assert.equal(board.visible(100).length, 0);
});

test("a box is erased only on its outline: inside and far outside are safe", () => {
  const board = new StrokeBoard();
  pin(board, 0, "box", 0.1); // corners (0.1, 0.1) and (0.3, 0.4)
  assert.equal(board.eraseAt(0.2, 0.25), 0, "in the middle of the box");
  assert.equal(board.eraseAt(0.2, 0.25 + 0.05), 0, "still inside, clear of every edge");
  assert.equal(board.eraseAt(0.7, 0.7), 0, "far outside");
  assert.equal(board.pinnedShapes().length, 1);
  assert.equal(board.eraseAt(0.2, 0.1 + ERASER_RADIUS * 0.5), 1, "on the top edge");
  assert.equal(board.pinnedShapes().length, 0);
});

test("an ellipse is erased on its outline only", () => {
  const board = new StrokeBoard();
  pin(board, 0, "ellipse", 0.1); // bounds x 0.1..0.3, y 0.1..0.4: centre (0.2, 0.25)
  assert.equal(board.eraseAt(0.2, 0.25), 0, "its centre");
  assert.equal(board.eraseAt(0.1, 0.1), 0, "the corner of its bounding box is outside the curve");
  assert.equal(board.eraseAt(0.3, 0.25), 1, "the right-hand edge of the curve");
});

test("erasing a labelled shape takes its text with it, and updates the pinned list version", () => {
  const board = new StrokeBoard();
  const box = pin(board, 0, "box", 0.1) as { id: number };
  board.setText(box.id, "Look here");
  const before = board.version;
  assert.equal(board.eraseAt(0.1, 0.25), 1, "the left edge");
  assert.deepEqual(board.pinnedShapes(), []);
  assert.ok(board.version > before, "the host's list is told");
  freehand(board, 100, [[0.5, 0.5], [0.6, 0.6]]);
  const afterPinned = board.version;
  assert.equal(board.eraseAt(0.55, 0.55), 1);
  assert.equal(board.version, afterPinned, "erasing a freehand stroke doesn't touch the pinned list");
});

test("a stroke still being drawn is not erased", () => {
  const board = new StrokeBoard();
  board.begin(0, "red", undefined, "free");
  board.add(0.5, 0.5);
  board.add(0.6, 0.6);
  assert.equal(board.eraseAt(0.55, 0.55), 0);
  assert.equal(board.drawing, true);
});

test("a guest's finished stroke can be erased by the host's eraser too", () => {
  const board = new StrokeBoard();
  board.begin(0, "#00aaff", "guest-1");
  board.add(0.4, 0.4, "guest-1");
  board.add(0.5, 0.5, "guest-1");
  board.end(10, "guest-1");
  assert.equal(board.eraseAt(0.45, 0.45), 1);
});

test("a fast sweep between two positions erases what it passes over, a single position does not jump", () => {
  const board = new StrokeBoard();
  freehand(board, 0, [[0.5, 0.2], [0.5, 0.3]]);
  assert.equal(board.eraseAt(0.9, 0.25), 0);
  assert.equal(board.eraseSwept({ x: 0.1, y: 0.25 }, { x: 0.9, y: 0.25 }), 1, "the sweep crosses the stroke");
  const alone = new StrokeBoard();
  freehand(alone, 0, [[0.5, 0.2], [0.5, 0.3]]);
  assert.equal(alone.eraseSwept(null, { x: 0.9, y: 0.25 }), 0, "with no previous position it is just the one spot");
  assert.equal(alone.eraseSwept(null, { x: 0.5, y: 0.25 }), 1);
});

test("clear() still removes everything and undo still removes the newest pinned shape after erasing", () => {
  const board = new StrokeBoard();
  const first = pin(board, 0, "box", 0.05) as { id: number };
  pin(board, 100, "ellipse", 0.5);
  board.eraseAt(0.05, 0.25);
  assert.equal(board.pinnedShapes().length, 1);
  assert.notEqual(board.undoLast(), first.id);
  assert.equal(board.pinnedShapes().length, 0);
  pin(board, 200);
  board.clear();
  assert.equal(board.visible(300).length, 0);
});

function pinArrow(board: StrokeBoard, t: number, x = 0.1) {
  board.begin(t, "red", undefined, "arrow");
  board.add(x, 0.1);
  board.add(x + 0.3, 0.5);
  return board.end(t + 10) as { id: number };
}

test("arrows are listed with the other pinned shapes, in order, and carry no label", () => {
  const board = new StrokeBoard();
  const box = pin(board, 0, "box", 0.5) as { id: number };
  const arrowStroke = pinArrow(board, 100);
  assert.deepEqual(board.pinnedShapes().map((shape) => [shape.id, shape.kind]), [[box.id, "box"], [arrowStroke.id, "arrow"]]);
  assert.equal(board.setText(arrowStroke.id, "no room for text"), false, "an arrow can't be labelled");
  assert.equal(board.pinnedShapes()[1].text, "");
  assert.equal(board.setText(box.id, "ok"), true, "boxes still can");
  assert.equal(takesText("arrow"), false);
  assert.equal(takesText("box") && takesText("ellipse"), true);
  assert.equal(takesText("free"), false);
  assert.equal(takesText("text"), true, "a text stamp's whole point is its text");
});

test("a text stamp is pinned, never fades, and is erased only by its outline like a box, not its middle", () => {
  const board = new StrokeBoard();
  board.begin(0, "red", undefined, "text");
  board.add(0.1, 0.1);
  board.add(0.3, 0.4);
  const stamp = board.end(10) as { id: number };
  assert.ok(stamp, "big enough to keep");
  board.setText(stamp.id, "Hello");
  assert.deepEqual(board.pinnedShapes(), [{ id: stamp.id, kind: "text", text: "Hello" }]);
  assert.equal(board.visible(100000).find(({ stroke }) => stroke.id === stamp.id)?.alpha, 1, "never fades");
  assert.equal(board.eraseAt(0.2, 0.25, 0.02), 0, "the middle of the stamp is not on its outline");
  assert.equal(board.eraseAt(0.1, 0.25, 0.02), 1, "its left edge is");
});

test("an arrow can be removed, undone and cleared like any pinned shape", () => {
  const board = new StrokeBoard();
  const a = pinArrow(board, 0, 0.05);
  const b = pinArrow(board, 100, 0.4);
  const c = pinArrow(board, 200, 0.7);
  assert.equal(board.remove(b.id), true);
  assert.deepEqual(board.pinnedShapes().map((shape) => shape.id), [a.id, c.id]);
  assert.equal(board.undoLast(), c.id);
  board.clear();
  assert.equal(board.visible(300).length, 0);
  assert.deepEqual(board.pinnedShapes(), []);
});

test("arrows count toward the pinned cap: the oldest pinned mark goes first", () => {
  const board = new StrokeBoard();
  const first = pinArrow(board, 0);
  for (let i = 1; i <= MAX_PINNED; i++) pin(board, i * 100, i % 2 ? "box" : "ellipse", 0.01 * (i % 20));
  const kept = board.pinnedShapes();
  assert.equal(kept.length, MAX_PINNED);
  assert.ok(!kept.some((shape) => shape.id === first.id), "the oldest (an arrow) was dropped");
});

test("erasing a pinned arrow updates the pinned list and, unlike a box, works anywhere along the line", () => {
  const board = new StrokeBoard();
  const arrowStroke = pinArrow(board, 0); // from (0.1, 0.1) to (0.4, 0.5)
  const before = board.version;
  assert.equal(board.eraseAt(0.9, 0.9), 0);
  assert.equal(board.eraseAt(0.25, 0.3), 1, "the middle of the line");
  assert.ok(board.version > before);
  assert.equal(board.pinnedShapes().some((shape) => shape.id === arrowStroke.id), false);
});

test("isStraightLine accepts a wobbly line, either direction, and rejects curves, loops and short marks", () => {
  const line = Array.from({ length: 20 }, (_, i) => ({ x: 0.1 + i * 0.02, y: 0.3 + i * 0.01 + (i % 2 ? 0.002 : -0.002) }));
  assert.equal(isStraightLine(line, 16 / 9), true);
  assert.equal(isStraightLine([...line].reverse(), 16 / 9), true);
  const arc = Array.from({ length: 20 }, (_, i) => ({ x: 0.1 + i * 0.02, y: 0.3 + Math.sin((i / 19) * Math.PI) * 0.12 }));
  assert.equal(isStraightLine(arc, 16 / 9), false, "a bow is a curve, not a line");
  const loop = Array.from({ length: 30 }, (_, i) => ({ x: 0.5 + Math.cos((i / 29) * Math.PI * 2) * 0.1, y: 0.5 + Math.sin((i / 29) * Math.PI * 2) * 0.1 }));
  assert.equal(isStraightLine(loop, 16 / 9), false, "a closed shape is not a line");
  assert.equal(isStraightLine([{ x: 0.1, y: 0.1 }, { x: 0.11, y: 0.1 }], 16 / 9), false, "too short");
});

test("convertToArrow turns a finished freehand stroke into a pinned two-point arrow", () => {
  const board = new StrokeBoard();
  board.begin(0, "red");
  board.add(0.1, 0.1);
  board.add(0.2, 0.15);
  board.add(0.3, 0.2);
  const id = board.currentId()!;
  board.end(10);
  assert.equal(board.convertToArrow(id), true);
  const [shown] = board.visible(60000);
  assert.equal(shown.stroke.kind, "arrow");
  assert.equal(shown.alpha, 1, "an arrow never fades");
  assert.deepEqual(shown.stroke.points, [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.2 }]);
  assert.equal(board.convertToArrow(id), false, "already an arrow");
});
