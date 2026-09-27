import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GRAB_MARGIN,
  HEADER_HEIGHT,
  NUDGE_STEP,
  NUDGE_STEP_LARGE,
  clampPanelPosition,
  dragPanelPosition,
  nudgePanelPosition,
  parseStoredPanel,
  serializePanel,
} from "./panel-position.ts";

const VIEW = { width: 1280, height: 720 };
const SIZE = { width: 288, height: 400 };

test("a position inside the window is left alone", () => {
  assert.deepEqual(clampPanelPosition({ x: 200, y: 100 }, SIZE, VIEW), { x: 200, y: 100 });
});

test("the header can't go above the top or below the bottom of the window", () => {
  assert.equal(clampPanelPosition({ x: 200, y: -50 }, SIZE, VIEW).y, 0);
  assert.equal(clampPanelPosition({ x: 200, y: 5000 }, SIZE, VIEW).y, VIEW.height - HEADER_HEIGHT);
});

test("at least GRAB_MARGIN of the panel stays inside the window on the left and the right", () => {
  assert.equal(clampPanelPosition({ x: -5000, y: 10 }, SIZE, VIEW).x, GRAB_MARGIN - SIZE.width, "off the left edge, but the right part is still showing");
  assert.equal(clampPanelPosition({ x: 5000, y: 10 }, SIZE, VIEW).x, VIEW.width - GRAB_MARGIN, "off the right edge, but the left part is still showing");
});

test("a tiny window can't make the limits cross over", () => {
  const tiny = { width: 30, height: 10 };
  const clamped = clampPanelPosition({ x: 100, y: 100 }, SIZE, tiny);
  assert.ok(Number.isFinite(clamped.x) && Number.isFinite(clamped.y));
  assert.ok(clamped.y >= 0);
});

test("resizing the window pulls a stranded panel back into reach", () => {
  const before = clampPanelPosition({ x: 1100, y: 600 }, SIZE, VIEW);
  assert.deepEqual(before, { x: 1100, y: 600 });
  const smaller = { width: 800, height: 400 };
  const after = clampPanelPosition(before, SIZE, smaller);
  assert.equal(after.x, smaller.width - GRAB_MARGIN);
  assert.equal(after.y, smaller.height - HEADER_HEIGHT);
});

test("arrow keys nudge by a step, Shift by a bigger one, and other keys do nothing", () => {
  const start = { x: 300, y: 300 };
  assert.deepEqual(nudgePanelPosition(start, "ArrowLeft", false, SIZE, VIEW), { x: 300 - NUDGE_STEP, y: 300 });
  assert.deepEqual(nudgePanelPosition(start, "ArrowRight", false, SIZE, VIEW), { x: 300 + NUDGE_STEP, y: 300 });
  assert.deepEqual(nudgePanelPosition(start, "ArrowUp", true, SIZE, VIEW), { x: 300, y: 300 - NUDGE_STEP_LARGE });
  assert.deepEqual(nudgePanelPosition(start, "ArrowDown", true, SIZE, VIEW), { x: 300, y: 300 + NUDGE_STEP_LARGE });
  assert.equal(nudgePanelPosition(start, "Enter", false, SIZE, VIEW), null);
  assert.equal(nudgePanelPosition(start, "a", true, SIZE, VIEW), null);
});

test("nudging never pushes the panel out of reach", () => {
  assert.equal(nudgePanelPosition({ x: 3, y: 0 }, "ArrowUp", true, SIZE, VIEW)?.y, 0);
  assert.equal(nudgePanelPosition({ x: VIEW.width - GRAB_MARGIN, y: 10 }, "ArrowRight", true, SIZE, VIEW)?.x, VIEW.width - GRAB_MARGIN);
});

test("dragging moves the panel by how far the pointer moved, and stays reachable", () => {
  assert.deepEqual(dragPanelPosition({ x: 100, y: 100 }, { x: 500, y: 40 }, { x: 560, y: 90 }, SIZE, VIEW), { x: 160, y: 150 });
  assert.equal(dragPanelPosition({ x: 100, y: 100 }, { x: 500, y: 40 }, { x: 500, y: 9000 }, SIZE, VIEW).y, VIEW.height - HEADER_HEIGHT);
});

test("a stored position round-trips", () => {
  const stored = { position: { x: 120, y: 64 }, collapsed: true };
  assert.deepEqual(parseStoredPanel(serializePanel(stored)), stored);
  assert.deepEqual(parseStoredPanel(serializePanel({ position: null, collapsed: false })), { position: null, collapsed: false });
});

test("missing, corrupt or hand-edited storage gives the defaults, never an error", () => {
  const defaults = { position: null, collapsed: false };
  for (const bad of [null, undefined, "", "not json", "{", "[]", "42", "null", '"text"']) {
    assert.deepEqual(parseStoredPanel(bad), defaults, String(bad));
  }
  assert.deepEqual(parseStoredPanel('{"x":"1","y":2,"collapsed":true}'), { position: null, collapsed: true }, "a non-number coordinate drops the position, keeps the rest");
  assert.deepEqual(parseStoredPanel('{"x":1e999,"y":5}'), { position: null, collapsed: false }, "infinite is not a position");
  assert.deepEqual(parseStoredPanel('{"x":10,"y":20,"collapsed":"yes"}'), { position: { x: 10, y: 20 }, collapsed: false }, "only true collapses it");
});
