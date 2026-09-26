import { test } from "node:test";
import assert from "node:assert/strict";
import { REACTION_HOLD_MS, REACTION_MS, REACTION_RISE, ReactionPlayer, reactionPosition } from "./reactions.ts";

test("a reaction is solid at first, then fades out over about 2 seconds", () => {
  const player = new ReactionPlayer();
  assert.equal(player.frame(0), null);
  player.start(1000, "thumbsup");
  assert.equal(player.frame(1000)?.alpha, 1);
  assert.equal(player.frame(1000 + REACTION_HOLD_MS)?.alpha, 1);
  const mid = player.frame(1000 + (REACTION_HOLD_MS + REACTION_MS) / 2);
  assert.ok(mid && Math.abs(mid.alpha - 0.5) < 1e-9);
  assert.equal(player.frame(1000 + REACTION_MS), null, "gone after ~2 s");
  assert.equal(player.frame(1000 + 500), null, "and stays gone");
});

test("only one reaction is shown at a time: a new one replaces the old", () => {
  const player = new ReactionPlayer();
  player.start(0, "thumbsup");
  player.start(500, "wave");
  assert.equal(player.frame(600)?.kind, "wave");
  assert.ok((player.frame(600)?.progress ?? 1) < 0.1, "the new one starts from the beginning");
});

test("clear removes the reaction at once", () => {
  const player = new ReactionPlayer();
  player.start(0, "thumbsdown");
  player.clear();
  assert.equal(player.frame(10), null);
});

test("the emoji sits by the top of the ghost, rises by 15% of the frame height and follows the ghost", () => {
  const ghost = { x: 400, y: 200, width: 300, height: 520 };
  const start = reactionPosition(ghost, 1280, 720, 0);
  const end = reactionPosition(ghost, 1280, 720, 1);
  assert.ok(start.x > ghost.x + ghost.width / 2 && start.x < ghost.x + ghost.width, "beside the head, on the ghost");
  assert.ok(start.y > ghost.y && start.y < ghost.y + ghost.height / 2, "near the top of the ghost");
  assert.ok(Math.abs(start.y - end.y - 720 * REACTION_RISE) < 1e-9, "floats up");
  assert.equal(start.size, 72);
  const moved = reactionPosition({ ...ghost, x: ghost.x + 100 }, 1280, 720, 0);
  assert.ok(Math.abs(moved.x - start.x - 100) < 1e-9, "follows the ghost sideways");
});

test("the emoji is kept on the frame even when the ghost is at an edge or taller than the frame", () => {
  const edge = reactionPosition({ x: 1200, y: 0, width: 400, height: 900 }, 1280, 720, 1);
  assert.ok(edge.x <= 1280 - edge.size && edge.y >= edge.size);
  const left = reactionPosition({ x: -500, y: 600, width: 300, height: 300 }, 1280, 720, 0);
  assert.ok(left.x >= left.size && left.y <= 720 - left.size);
});
