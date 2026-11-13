import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GENERAL_SLOT,
  WEEK_MS,
  clampPerWeek,
  estimateReleaseTimes,
  minGapMs,
  planReleases,
  summarizeSlots,
  type QueuedArticle,
} from "./curated-article-schedule.ts";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const T0 = new Date("2026-11-16T12:00:00Z");
const at = (offsetMs: number) => new Date(T0.getTime() + offsetMs);
const q = (id: string, communityIds: string[], approvedOffset = 0): QueuedArticle => ({ id, communityIds, scheduledAt: at(approvedOffset) });

describe("[AC:0adb7110:ac_2] per-community release cadence", () => {
  it("releases the oldest-approved article first, one per slot per tick", () => {
    const queue = [q("health-2", ["health"], 2), q("health-1", ["health"], 1), q("sci-1", ["science"], 3)];
    assert.deepEqual(planReleases({ queue, recent: [], perWeek: 3, now: T0 }), ["health-1", "sci-1"]);
  });

  it("untagged articles share one General slot", () => {
    const queue = [q("g1", [], 1), q("g2", [], 2)];
    assert.deepEqual(planReleases({ queue, recent: [], perWeek: 3, now: T0 }), ["g1"]);
    const summary = summarizeSlots({ queue, recent: [], perWeek: 3, now: T0 });
    assert.deepEqual(summary.map((s) => s.slot), [GENERAL_SLOT]);
  });

  it("waits at least 7/N days between releases in a slot", () => {
    const recent = [{ approvedAt: at(-2 * DAY), communityIds: ["health"] }];
    const queue = [q("h", ["health"])];
    // perWeek 3 -> gap 56h; only 48h since the last release.
    assert.deepEqual(planReleases({ queue, recent, perWeek: 3, now: T0 }), []);
    assert.deepEqual(planReleases({ queue, recent, perWeek: 3, now: at(8 * HOUR) }), ["h"]);
    assert.equal(minGapMs(3), 56 * HOUR);
  });

  it("never exceeds N releases in any rolling 7 days", () => {
    const perWeek = 3;
    const queue = Array.from({ length: 12 }, (_, i) => q(`h${i}`, ["health"], i));
    const times = estimateReleaseTimes({ queue, recent: [], perWeek, now: T0 });
    const released = Array.from(times.values()).filter((d): d is Date => d !== null).map((d) => d.getTime()).sort((a, b) => a - b);
    assert.equal(released.length, 12, "the whole queue drains eventually");
    for (const start of released) {
      const inWindow = released.filter((t) => t >= start && t < start + WEEK_MS).length;
      assert.ok(inWindow <= perWeek, `at most ${perWeek} in the week from ${new Date(start).toISOString()}`);
    }
    for (let i = 1; i < released.length; i++) assert.ok(released[i] - released[i - 1] >= minGapMs(perWeek));
    // FIFO: queue order is preserved.
    const order = Array.from(times.entries()).sort((a, b) => a[1]!.getTime() - b[1]!.getTime()).map(([id]) => id);
    assert.deepEqual(order, queue.map((a) => a.id));
  });

  it("a multi-community article goes out when any of its slots has room, and counts against all of them", () => {
    const recent = [{ approvedAt: at(-1 * HOUR), communityIds: ["health"] }];
    const queue = [q("both", ["health", "science"], 1), q("sci", ["science"], 2)];
    // health is closed, science is open -> "both" releases via science; "sci" then waits.
    assert.deepEqual(planReleases({ queue, recent, perWeek: 3, now: T0 }), ["both"]);
  });

  it("releases from other communities don't hold a slot back", () => {
    const recent = [{ approvedAt: at(-1 * HOUR), communityIds: ["science"] }];
    assert.deepEqual(planReleases({ queue: [q("h", ["health"])], recent, perWeek: 3, now: T0 }), ["h"]);
  });

  it("clamps the per-week setting to 1–14", () => {
    assert.equal(clampPerWeek(0), 1);
    assert.equal(clampPerWeek(99), 14);
    assert.equal(clampPerWeek(Number.NaN), 3);
  });
});

describe("[AC:0adb7110:ac_5] Scheduled tab estimates", () => {
  it("reports per-slot queued counts, this week's releases, and when the slot next opens", () => {
    const recent = [
      { approvedAt: at(-1 * DAY), communityIds: ["health"] },
      { approvedAt: at(-10 * DAY), communityIds: ["health"] }, // outside the window
    ];
    const queue = [q("h1", ["health"]), q("h2", ["health"]), q("s1", ["science"])];
    const summary = new Map(summarizeSlots({ queue, recent, perWeek: 2, now: T0 }).map((s) => [s.slot, s]));
    assert.equal(summary.get("health")?.queued, 2);
    assert.equal(summary.get("health")?.releasedThisWeek, 1);
    // perWeek 2 -> 84h gap from the release a day ago -> opens in 60h.
    assert.equal(summary.get("health")?.nextReleaseAt?.toISOString(), at(60 * HOUR).toISOString());
    assert.equal(summary.get("science")?.nextReleaseAt?.toISOString(), T0.toISOString(), "an empty slot is open now");
  });

  it("estimates each queued article's release time with the same rules the worker uses", () => {
    const queue = [q("a", ["health"], 1), q("b", ["health"], 2)];
    const times = estimateReleaseTimes({ queue, recent: [], perWeek: 7, now: T0 });
    assert.equal(times.get("a")?.toISOString(), T0.toISOString());
    assert.equal(times.get("b")?.toISOString(), at(DAY).toISOString(), "perWeek 7 -> one a day");
  });
});
