import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CHANGE_FRACTION,
  GLIDE_MS,
  INITIAL_MS,
  MAX_ZOOM,
  MIN_ZOOM,
  SETTLE_MS,
  SizeNormalizer,
  TARGET_HEIGHT,
  measureFromRows,
  zoomFor,
} from "./size-normalize.ts";

const W = 160;
const H = 120;

/** Row counts for a person whose head top is at `top` (fraction of height), body `bodyWidth` wide down to the bottom. */
function rows(top: number, bodyWidth = 60, extra: (r: Uint32Array) => void = () => {}): Uint32Array {
  const counts = new Uint32Array(H);
  for (let r = Math.round(top * H); r < H; r++) counts[r] = bodyWidth;
  extra(counts);
  return counts;
}

test("measures from the top of the head to the bottom of the frame", () => {
  assert.ok(Math.abs((measureFromRows(rows(0.25), W, H) as number) - 0.75) < 0.02);
  assert.ok(Math.abs((measureFromRows(rows(0.5), W, H) as number) - 0.5) < 0.02);
});

test("a raised or stretched arm above the head does not change the measurement", () => {
  const plain = measureFromRows(rows(0.4), W, H) as number;
  const armUp = measureFromRows(
    rows(0.4, 60, (r) => {
      for (let y = 5; y < 0.4 * H; y++) r[y] = 4; // thin arm, ~2.5% of the width, reaching almost to the top
    }),
    W,
    H,
  ) as number;
  assert.equal(armUp, plain);
});

test("a single stray row of noise is not the head", () => {
  const plain = measureFromRows(rows(0.4), W, H) as number;
  const noisy = measureFromRows(rows(0.4, 60, (r) => (r[10] = 40)), W, H) as number;
  assert.equal(noisy, plain);
});

test("untrustworthy frames measure nothing: nobody, head at the top edge, person not reaching the bottom", () => {
  assert.equal(measureFromRows(new Uint32Array(H), W, H), null);
  assert.equal(measureFromRows(rows(0), W, H), null);
  const floating = new Uint32Array(H);
  for (let r = 30; r < 80; r++) floating[r] = 60;
  assert.equal(measureFromRows(floating, W, H), null);
});

test("zoom fills the target height and is capped both ways", () => {
  assert.equal(zoomFor(TARGET_HEIGHT), 1);
  assert.ok(Math.abs(zoomFor(0.5) - 1.5) < 1e-9, "a far-away person is zoomed in");
  assert.ok(zoomFor(0.95) < 1, "a close person is shrunk");
  assert.equal(zoomFor(0.15), MAX_ZOOM, "a face-only close-up is not blown up past the cap");
  assert.equal(zoomFor(0.9999999), TARGET_HEIGHT / 0.9999999);
  assert.ok(zoomFor(1) >= MIN_ZOOM);
});

/** Feeds a constant measurement at 10 Hz from `from` to `to` ms. */
function feed(n: SizeNormalizer, from: number, to: number, m: number | null) {
  for (let t = from; t <= to; t += 100) n.observe(t, m);
}

test("a new camera is sized from its first measurements, within about 3 seconds, without gliding", () => {
  const n = new SizeNormalizer();
  assert.equal(n.zoom(0, true), 1, "full-frame sizing until anything is measured");
  feed(n, 0, 500, 0.5);
  assert.ok(Math.abs(n.zoom(500, true) - 1.5) < 1e-9, "sized right away");
  feed(n, 600, INITIAL_MS + 100, 0.5);
  assert.ok(Math.abs(n.zoom(INITIAL_MS + 100, true) - 1.5) < 1e-9);
});

test("two people at different distances end up the same on-screen height", () => {
  const near = new SizeNormalizer();
  const far = new SizeNormalizer();
  feed(near, 0, 3000, 0.95);
  feed(far, 0, 3000, 0.45);
  const nearHeight = 0.95 * near.zoom(3000, true);
  const farHeight = 0.45 * far.zoom(3000, true);
  assert.ok(Math.abs(nearHeight - farHeight) < 0.02, `${nearHeight} vs ${farHeight}`);
});

test("a lean-in or stretch lasting seconds does not change the zoom", () => {
  const n = new SizeNormalizer();
  feed(n, 0, 3000, 0.6);
  const before = n.zoom(3000, true);
  feed(n, 3100, 3100 + SETTLE_MS - 1500, 0.9); // leaning in for ~8.5 s: looks much bigger
  assert.equal(n.zoom(3100 + SETTLE_MS - 1500, true), before);
  feed(n, 12_000, 20_000, 0.6);
  assert.equal(n.zoom(20_000, true), before, "and back to normal");
});

test("a change that holds for the settle time is adopted with a ~1 second glide, not a jump", () => {
  const n = new SizeNormalizer();
  feed(n, 0, 3000, 0.6);
  const before = n.zoom(3000, true);
  const start = 4000;
  feed(n, start, start + SETTLE_MS + 500, 0.9); // moved the chair back... closer to the camera
  const adoptedAt = start + SETTLE_MS;
  // Somewhere just after adoption it is between the old and new zoom.
  const mid = n.zoom(adoptedAt + GLIDE_MS / 2 + 500, true);
  const after = n.zoom(adoptedAt + GLIDE_MS / 2 + 500 + GLIDE_MS, true);
  const expected = zoomFor(0.9);
  assert.ok(Math.abs(after - expected) < 1e-9, `${after} vs ${expected}`);
  assert.ok(before > expected);
  assert.ok(mid <= before + 1e-9 && mid >= expected - 1e-9);
});

test("a change that wobbles between levels keeps restarting the settle timer", () => {
  const n = new SizeNormalizer();
  feed(n, 0, 3000, 0.6);
  const before = n.zoom(3000, true);
  // Alternates between two different new levels every 4 s; neither lasts 10 s.
  for (let t = 3100; t < 40_000; t += 100) n.observe(t, Math.floor((t - 3100) / 4000) % 2 === 0 ? 0.95 : 0.35);
  assert.equal(n.zoom(40_000, true), before);
});

test("untrustworthy measurements hold the zoom and reset a change in progress", () => {
  const n = new SizeNormalizer();
  feed(n, 0, 3000, 0.6);
  const before = n.zoom(3000, true);
  feed(n, 3100, 3100 + SETTLE_MS - 1000, 0.9);
  feed(n, 3100 + SETTLE_MS, 3100 + SETTLE_MS + 500, null); // head touches the top / nobody
  feed(n, 3100 + SETTLE_MS + 600, 3100 + SETTLE_MS + 5000, 0.9);
  assert.equal(n.zoom(3100 + SETTLE_MS + 5000, true), before, "the timer restarted, so 5 s of the new level isn't enough");
  feed(n, 20_000, 20_000 + 3000, null);
  assert.equal(n.zoom(23_000, true), before);
});

test("small differences below the change fraction never move the zoom", () => {
  const n = new SizeNormalizer();
  feed(n, 0, 3000, 0.6);
  const before = n.zoom(3000, true);
  feed(n, 3100, 60_000, 0.6 * (1 + CHANGE_FRACTION * 0.8));
  assert.equal(n.zoom(60_000, true), before);
});

test("turning it off glides to full-frame sizing and back on glides to the zoom", () => {
  const n = new SizeNormalizer();
  feed(n, 0, 3000, 0.5);
  const on = n.zoom(3000, true);
  assert.ok(on > 1);
  const t0 = 4000;
  assert.equal(n.zoom(t0, false), on, "the moment it's switched off nothing jumps");
  const mid = n.zoom(t0 + GLIDE_MS / 2, false);
  assert.ok(mid < on && mid > 1);
  assert.equal(n.zoom(t0 + GLIDE_MS, false), 1);
  n.zoom(t0 + GLIDE_MS * 3, true);
  assert.ok(Math.abs(n.zoom(t0 + GLIDE_MS * 5, true) - on) < 1e-9);
});

test("measurement keeps running while off, so switching on uses a settled zoom", () => {
  const n = new SizeNormalizer();
  feed(n, 0, 3000, 0.5);
  n.zoom(3000, false);
  feed(n, 3100, 3100 + SETTLE_MS + 500, 0.9); // the person moved while it was off
  const t = 3100 + SETTLE_MS + 1000;
  assert.equal(n.zoom(t, false), 1);
  n.zoom(t + 10, true);
  assert.ok(Math.abs(n.zoom(t + GLIDE_MS * 2, true) - zoomFor(0.9)) < 1e-9);
});
