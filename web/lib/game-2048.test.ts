import { test } from "node:test";
import assert from "node:assert/strict";
import { Game2048, replay2048, seedFromString, type Direction } from "./game-2048.ts";

function withRow(game: Game2048, values: number[]) {
  game.grid = Array(16).fill(null);
  values.forEach((value, c) => {
    if (value) game.grid[c] = { id: 1000 + c, value };
  });
}
const row = (game: Game2048) => game.grid.slice(0, 4).map((t) => t?.value ?? 0);

test("merges each pair once: 2 2 2 2 ← becomes 4 4", () => {
  const game = new Game2048(1);
  withRow(game, [2, 2, 2, 2]);
  assert.equal(game.move("L").gained, 8);
  assert.deepEqual(row(game), [4, 4, 0, 0]);
});

test("a merged tile doesn't merge again in the same move: 2 2 4 ← becomes 4 4", () => {
  const game = new Game2048(1);
  withRow(game, [2, 2, 4, 0]);
  game.move("L");
  assert.deepEqual(row(game), [4, 4, 0, 0]);
});

test("merges toward the moving edge: 2 2 2 → becomes _ _ 2 4", () => {
  const game = new Game2048(1);
  withRow(game, [2, 2, 2, 0]);
  game.move("R");
  assert.deepEqual(row(game).slice(2), [2, 4]);
});

test("a move that changes nothing is rejected and not recorded", () => {
  const game = new Game2048(1);
  withRow(game, [2, 4, 0, 0]);
  const before = game.moves;
  assert.equal(game.move("L").moved, false);
  assert.equal(game.moves, before);
});

test("same seed, same moves → same game (what the server replay relies on)", () => {
  const seed = seedFromString("cmv3735iy0000dqcv5yazzll2");
  const live = new Game2048(seed);
  const dirs: Direction[] = ["L", "U", "R", "D"];
  for (let i = 0; i < 400 && live.canMove(); i++) {
    for (const d of [dirs[i % 4], ...dirs]) if (live.move(d).moved) break;
  }
  const replayed = replay2048(seed, live.moves);
  assert.equal(replayed.valid, true);
  assert.equal(replayed.score, live.score);
  assert.equal(replayed.maxTile, live.maxTile);
  assert.ok(live.score > 0);
});

test("replay rejects moves that weren't played on this seed", () => {
  const seed = 42;
  const live = new Game2048(seed);
  // Slide left until the board stops changing; one more "L" is then a no-op
  // that a real client would never have recorded.
  while (live.move("L").moved);
  assert.equal(replay2048(seed, live.moves).valid, true);
  assert.equal(replay2048(seed, live.moves + "L").valid, false);
  assert.equal(replay2048(seed, live.moves + "X").valid, false);
});

test("canMove is false only on a full board with no equal neighbours", () => {
  const game = new Game2048(1);
  const values = [2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 2];
  game.grid = values.map((value, i) => ({ id: i + 1, value }));
  assert.equal(game.canMove(), false);
  game.grid[1] = { id: 99, value: 2 };
  assert.equal(game.canMove(), true);
});
