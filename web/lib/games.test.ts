import { test } from "node:test";
import assert from "node:assert/strict";
import { towerResultProblem, TOWER_MIN_MS_PER_FLOOR, GAME_RUN_MAX_AGE_MS } from "./games.ts";

const plenty = 10 * 60 * 1000;

test("accepts a normal run", () => {
  assert.equal(towerResultProblem({ score: 12, floors: 10, perfects: 2 }, plenty), null);
});

test("accepts the best-case unbroken combo exactly", () => {
  // 5 floors, all perfect: 5 + (1+2+3+4+5) = 20
  assert.equal(towerResultProblem({ score: 20, floors: 5, perfects: 5 }, plenty), null);
});

test("accepts a zero-floor run", () => {
  assert.equal(towerResultProblem({ score: 0, floors: 0, perfects: 0 }, 1000), null);
});

test("rejects a score above the combo ceiling", () => {
  assert.notEqual(towerResultProblem({ score: 21, floors: 5, perfects: 5 }, plenty), null);
});

test("rejects more perfects than floors", () => {
  assert.notEqual(towerResultProblem({ score: 10, floors: 3, perfects: 4 }, plenty), null);
});

test("rejects a score below the floor count", () => {
  assert.notEqual(towerResultProblem({ score: 2, floors: 3, perfects: 0 }, plenty), null);
});

test("rejects floors placed faster than the game allows", () => {
  const floors = 40;
  assert.notEqual(towerResultProblem({ score: floors, floors, perfects: 0 }, floors * TOWER_MIN_MS_PER_FLOOR - 1), null);
  assert.equal(towerResultProblem({ score: floors, floors, perfects: 0 }, floors * TOWER_MIN_MS_PER_FLOOR), null);
});

test("rejects an expired run", () => {
  assert.notEqual(towerResultProblem({ score: 1, floors: 1, perfects: 0 }, GAME_RUN_MAX_AGE_MS + 1), null);
});
