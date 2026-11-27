import { test } from "node:test";
import assert from "node:assert/strict";
import { mergedIntervalMinutes } from "./meeting-presence.ts";

const min = 60_000;

test("no connections is zero minutes", () => {
  assert.equal(mergedIntervalMinutes([]), 0);
});

test("a single connection counts its full length, rounded down", () => {
  assert.equal(mergedIntervalMinutes([[0, 14 * min + 59_000]]), 14);
});

test("a leave and rejoin adds the two stays, not the gap", () => {
  assert.equal(mergedIntervalMinutes([[0, 10 * min], [20 * min, 26 * min]]), 16);
});

test("two devices at once never double-count", () => {
  assert.equal(mergedIntervalMinutes([[0, 30 * min], [5 * min, 20 * min]]), 30);
});

test("overlapping connections in any order merge into one span", () => {
  assert.equal(mergedIntervalMinutes([[25 * min, 40 * min], [0, 10 * min], [8 * min, 30 * min]]), 40);
});
