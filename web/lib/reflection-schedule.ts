// Pure schedule math for the Weekly Reflection post — no imports (no db, no
// "@/" alias) so it runs under the repo's plain `node --test` runner. Weeks
// are UTC ISO weeks (Monday-start); the admin objective can later add a time
// zone by passing different values through ReflectionSchedule without
// touching this logic.

export type ReflectionSchedule = {
  enabled: boolean;
  /** 0 = Sunday … 6 = Saturday, same convention as the weekly digest. */
  dayOfWeek: number;
  /** 0–23, UTC. */
  hour: number;
};

export const DEFAULT_REFLECTION_SCHEDULE: ReflectionSchedule = { enabled: true, dayOfWeek: 1, hour: 9 };

const DAY_MS = 24 * 60 * 60 * 1000;

/** Monday 00:00 UTC of the ISO week containing `date`. */
export function isoWeekStart(date: Date): Date {
  const dayStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  return new Date(dayStart - daysSinceMonday * DAY_MS);
}

/** UTC ISO week as "YYYY-Www" (ISO week-numbering year, so 2026-12-31 is "2026-W53" and 2027-01-01 too). */
export function isoWeekKey(date: Date): string {
  // The ISO year/week is that of the Thursday of the same Monday-start week.
  const thursday = new Date(isoWeekStart(date).getTime() + 3 * DAY_MS);
  const isoYear = thursday.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstWeekStart = isoWeekStart(firstThursday);
  const week = Math.round((isoWeekStart(thursday).getTime() - firstWeekStart.getTime()) / (7 * DAY_MS)) + 1;
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

/** The moment inside `now`'s ISO week at which the post becomes due. */
export function dueAtForWeek(now: Date, schedule: Pick<ReflectionSchedule, "dayOfWeek" | "hour">): Date {
  const offsetDays = (schedule.dayOfWeek + 6) % 7;
  return new Date(isoWeekStart(now).getTime() + offsetDays * DAY_MS + schedule.hour * 60 * 60 * 1000);
}

/**
 * True once the configured day/hour of the current ISO week has arrived. A
 * worker that was down at the exact time still posts on its next tick that
 * same week, but never carries over into the next one — the weekKey changes
 * at Monday 00:00 UTC, so a missed week is simply skipped.
 */
export function isReflectionDue(now: Date, schedule: ReflectionSchedule): boolean {
  if (!schedule.enabled) return false;
  return now.getTime() >= dueAtForWeek(now, schedule).getTime();
}
