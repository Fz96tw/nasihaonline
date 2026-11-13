import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createHostPacer } from "./host-pacer.ts";

// A fake clock: sleep() just advances it, so the test runs instantly.
function fakeClock() {
  let t = 0;
  const sleeps: number[] = [];
  return {
    now: () => t,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      t += ms;
    },
    advance: (ms: number) => {
      t += ms;
    },
    sleeps,
  };
}

describe("[AC:7d211c48:ac_4] [AC:7d211c48:ac_5] per-host request pacing", () => {
  it("waits at least 1.5s between requests to the same host", async () => {
    const clock = fakeClock();
    const pace = createHostPacer({ now: clock.now, sleep: clock.sleep });
    await pace("knowledge.wharton.upenn.edu");
    await pace("knowledge.wharton.upenn.edu");
    await pace("Knowledge.Wharton.upenn.edu");
    assert.deepEqual(clock.sleeps, [1500, 1500], "second and third requests each wait the full gap");
  });

  it("doesn't delay a request once the gap has already passed", async () => {
    const clock = fakeClock();
    const pace = createHostPacer({ now: clock.now, sleep: clock.sleep });
    await pace("a.example");
    clock.advance(2000);
    await pace("a.example");
    clock.advance(600);
    await pace("a.example");
    assert.deepEqual(clock.sleeps, [900]);
  });

  it("different hosts don't wait on each other", async () => {
    const clock = fakeClock();
    const pace = createHostPacer({ now: clock.now, sleep: clock.sleep });
    await pace("a.example");
    await pace("b.example");
    await pace("c.example");
    assert.deepEqual(clock.sleeps, []);
  });

  it("concurrent callers for one host are spaced out, not released together", async () => {
    const clock = fakeClock();
    const waits: number[] = [];
    const pace = createHostPacer({
      now: () => 0,
      sleep: async (ms) => {
        waits.push(ms);
      },
    });
    await Promise.all([pace("a.example"), pace("a.example"), pace("a.example")]);
    assert.deepEqual(waits, [1500, 3000]);
    void clock;
  });
});
