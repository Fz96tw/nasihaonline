import { test } from "node:test";
import assert from "node:assert/strict";
import { CHALLENGE_MS, MIN_DWELL_MS, SpeakerFollower, TAKEOVER_MS } from "./speaker-follow.ts";

const ALL = new Set(["host", "a", "b"]);
const STEP = 100;

/** Runs the follower over a timeline; `at(t)` says who speaks (id -> level) at time t. Returns the active id at every step. */
function run(f: SpeakerFollower, from: number, to: number, at: (t: number) => Record<string, number | undefined>, eligible: ReadonlySet<string> = ALL) {
  const trace: [number, string][] = [];
  for (let t = from; t <= to; t += STEP) {
    trace.push([t, f.update(t, new Map(Object.entries(at(t)).filter((e): e is [string, number] => e[1] !== undefined)), eligible, "host")]);
  }
  return trace;
}
const switches = (trace: [number, string][]) => trace.filter(([, id], i) => i > 0 && id !== trace[i - 1][1]);

test("switches to a guest only after sustained speech, then stays through silence", () => {
  const f = new SpeakerFollower("host");
  const trace = run(f, 0, 10_000, (t) => (t >= 3000 && t < 6000 ? { a: 0.3 } : {}));
  const [first] = switches(trace);
  assert.equal(first[1], "a");
  assert.ok(first[0] >= 3000 + TAKEOVER_MS, `switched too early at ${first[0]}`);
  assert.ok(first[0] <= 3000 + TAKEOVER_MS + 2 * STEP);
  assert.equal(trace[trace.length - 1][1], "a", "silence keeps the last speaker");
  assert.equal(switches(trace).length, 1);
});

test("a short burst does not take over", () => {
  const f = new SpeakerFollower("host");
  const trace = run(f, 0, 6000, (t) => (t >= 1000 && t < 1000 + TAKEOVER_MS - 300 ? { a: 0.5 } : {}));
  assert.equal(switches(trace).length, 0);
});

test("two overlapping speakers at similar loudness do not flicker or ping-pong", () => {
  const f = new SpeakerFollower("host");
  // a takes over, then a and b talk over each other for 20s with b marginally louder some of the time.
  const trace = run(f, 0, 30_000, (t) => {
    if (t < 4000) return { a: 0.3 };
    return { a: 0.3, b: t % 2000 < 1000 ? 0.36 : 0.28 };
  });
  assert.deepEqual(switches(trace).map(([, id]) => id), ["a"]);
});

test("a challenger clearly louder for long enough does take over, after the dwell and challenge time", () => {
  const f = new SpeakerFollower("host");
  const trace = run(f, 0, 20_000, (t) => (t < 4000 ? { a: 0.2 } : { a: 0.2, b: 0.6 }));
  const s = switches(trace);
  assert.deepEqual(s.map(([, id]) => id), ["a", "b"]);
  assert.ok(s[1][0] - 4000 >= CHALLENGE_MS - STEP);
});

test("never switches twice within the minimum dwell", () => {
  const f = new SpeakerFollower("host");
  const trace = run(f, 0, 20_000, (t) => (Math.floor(t / 1000) % 2 === 0 ? { a: 0.4 } : { b: 0.4 }));
  const s = switches(trace);
  for (let i = 1; i < s.length; i++) assert.ok(s[i][0] - s[i - 1][0] >= MIN_DWELL_MS, `switches ${s[i - 1][0]} and ${s[i][0]} too close`);
});

test("the host speaking brings the ghost back once the guest is quiet", () => {
  const f = new SpeakerFollower("host");
  const trace = run(f, 0, 12_000, (t) => (t < 4000 ? { a: 0.3 } : t >= 6000 ? { host: 0.3 } : {}));
  assert.deepEqual(switches(trace).map(([, id]) => id), ["a", "host"]);
});

test("a speaker without a camera is ignored and the ghost keeps its previous person", () => {
  const f = new SpeakerFollower("host");
  const noCam = new Set(["host", "a"]);
  const trace = run(f, 0, 8000, (t) => (t >= 1000 ? { b: 0.5 } : {}), noCam);
  assert.equal(switches(trace).length, 0);
  assert.equal(trace[trace.length - 1][1], "host");
});

test("pinning overrides speech; turning follow off freezes the current person", () => {
  const f = new SpeakerFollower("host");
  f.setPinned("b");
  let trace = run(f, 0, 5000, () => ({ a: 0.5 }));
  assert.equal(trace[trace.length - 1][1], "b");
  f.setPinned(null);
  f.setFollow(false);
  trace = run(f, 6000, 15_000, () => ({ a: 0.5 }));
  assert.equal(trace[trace.length - 1][1], "b", "follow off: stays on b");
  f.setFollow(true);
  trace = run(f, 16_000, 20_000, () => ({ a: 0.5 }));
  assert.equal(trace[trace.length - 1][1], "a", "follow back on: follows the speaker again");
});

test("when the shown person leaves, it falls back to the host", () => {
  const f = new SpeakerFollower("host");
  run(f, 0, 4000, () => ({ a: 0.4 }));
  assert.equal(f.current, "a");
  const trace = run(f, 4100, 4500, () => ({}), new Set(["host", "b"]));
  assert.equal(trace[trace.length - 1][1], "host");
});
