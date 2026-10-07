import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_REFLECTION_SCHEDULE, dueAtForWeek, isReflectionDue, isoWeekKey, isoWeekStart } from "./reflection-schedule.ts";

const utc = (y: number, m: number, d: number, h = 0, min = 0) => new Date(Date.UTC(y, m - 1, d, h, min));

describe("isoWeekKey", () => {
  it("is stable across the whole Monday–Sunday week", () => {
    // 2026-10-05 is a Monday.
    assert.equal(isoWeekKey(utc(2026, 10, 5, 0, 0)), "2026-W41");
    assert.equal(isoWeekKey(utc(2026, 10, 7, 12)), "2026-W41");
    assert.equal(isoWeekKey(utc(2026, 10, 11, 23, 59)), "2026-W41");
    assert.equal(isoWeekKey(utc(2026, 10, 12, 0, 0)), "2026-W42");
  });

  it("uses the ISO week-numbering year around New Year", () => {
    assert.equal(isoWeekKey(utc(2026, 12, 31)), "2026-W53");
    assert.equal(isoWeekKey(utc(2027, 1, 1)), "2026-W53");
    assert.equal(isoWeekKey(utc(2027, 1, 4)), "2027-W01");
    assert.equal(isoWeekKey(utc(2024, 12, 30)), "2025-W01");
  });

  it("pads single-digit weeks", () => {
    assert.equal(isoWeekKey(utc(2026, 1, 5)), "2026-W02");
  });
});

describe("isoWeekStart", () => {
  it("returns Monday 00:00 UTC, including for a Sunday", () => {
    assert.equal(isoWeekStart(utc(2026, 10, 11, 18)).toISOString(), "2026-10-05T00:00:00.000Z");
    assert.equal(isoWeekStart(utc(2026, 10, 5, 0, 0)).toISOString(), "2026-10-05T00:00:00.000Z");
  });
});

describe("dueAtForWeek / isReflectionDue", () => {
  it("defaults to Monday 09:00 UTC", () => {
    assert.equal(dueAtForWeek(utc(2026, 10, 8), DEFAULT_REFLECTION_SCHEDULE).toISOString(), "2026-10-05T09:00:00.000Z");
  });

  it("is not due before the configured time and is due from then through the end of the week", () => {
    assert.equal(isReflectionDue(utc(2026, 10, 5, 8, 59), DEFAULT_REFLECTION_SCHEDULE), false);
    assert.equal(isReflectionDue(utc(2026, 10, 5, 9, 0), DEFAULT_REFLECTION_SCHEDULE), true);
    assert.equal(isReflectionDue(utc(2026, 10, 11, 23, 59), DEFAULT_REFLECTION_SCHEDULE), true);
  });

  it("handles Sunday (0) as the last day of the ISO week", () => {
    const sunday = { enabled: true, dayOfWeek: 0, hour: 18 };
    assert.equal(dueAtForWeek(utc(2026, 10, 6), sunday).toISOString(), "2026-10-11T18:00:00.000Z");
    assert.equal(isReflectionDue(utc(2026, 10, 10, 23), sunday), false);
    assert.equal(isReflectionDue(utc(2026, 10, 11, 18), sunday), true);
  });

  it("is never due when disabled", () => {
    assert.equal(isReflectionDue(utc(2026, 10, 7), { ...DEFAULT_REFLECTION_SCHEDULE, enabled: false }), false);
  });
});
