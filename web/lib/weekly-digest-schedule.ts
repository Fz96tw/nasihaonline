// Pure schedule math for the community digest (no db, no server-only): shared
// by the worker job (when to fire), the generator (what period a digest
// covers) and tests. All "wall clock" reasoning is in the configured time
// zone, so daylight-saving shifts never move a digest off its configured hour.
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import type { DigestFrequency, WeeklyDigestSettings } from "@/lib/weekly-digest-config";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_DAYS = 7;
/**
 * A Monday that every-2-weeks cadences count from: a fire is on-cadence when
 * its week is an even number of weeks from this one. Fixed, so the alternation
 * is stable across restarts and setting changes.
 */
const BIWEEKLY_ANCHOR_DAY = Math.floor(Date.UTC(2026, 0, 5) / DAY_MS);

export type DigestSchedule = {
  frequency: DigestFrequency;
  /** 0 = Sunday … 6 = Saturday. */
  dayOfWeek: number;
  /** 0–23, wall-clock hour in `timeZone`. */
  hour: number;
  timeZone: string;
};

/** The schedule fields of the saved settings, in the shape the schedule math takes. */
export function scheduleOf(settings: WeeklyDigestSettings): DigestSchedule {
  return {
    frequency: settings.weeklyDigestFrequency,
    dayOfWeek: settings.weeklyDigestDayOfWeek,
    hour: settings.weeklyDigestHour,
    timeZone: settings.weeklyDigestTimezone,
  };
}

/** The day number of a wall-clock date (a zoned Date's local fields), independent of its time. */
function localDayNumber(local: Date): number {
  return Math.floor(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()) / DAY_MS);
}

function isBiweeklyOnCadence(local: Date): boolean {
  const weeks = Math.floor((localDayNumber(local) - BIWEEKLY_ANCHOR_DAY) / WEEK_DAYS);
  return ((weeks % 2) + 2) % 2 === 0;
}

/** The first `dayOfWeek` of the given wall-clock month, at `hour`:00. */
function firstWeekdayOfMonth(year: number, month: number, dayOfWeek: number, hour: number): Date {
  const first = new Date(year, month, 1, hour, 0, 0, 0);
  first.setDate(1 + ((dayOfWeek - first.getDay() + WEEK_DAYS) % WEEK_DAYS));
  return first;
}

/**
 * The most recent scheduled fire at or before `now`, as a UTC instant.
 *  - weekly: the latest configured weekday+hour;
 *  - biweekly: the same, but only every other week (on cadence);
 *  - monthly: the first configured weekday of a month, at the configured hour.
 */
export function latestScheduledFire(now: Date, schedule: DigestSchedule): Date {
  const { frequency, dayOfWeek, hour, timeZone } = schedule;
  const local = toZonedTime(now, timeZone);

  if (frequency === "monthly") {
    let candidate = firstWeekdayOfMonth(local.getFullYear(), local.getMonth(), dayOfWeek, hour);
    if (candidate.getTime() > local.getTime()) {
      candidate = firstWeekdayOfMonth(local.getFullYear(), local.getMonth() - 1, dayOfWeek, hour);
    }
    return fromZonedTime(candidate, timeZone);
  }

  const candidate = new Date(local);
  candidate.setHours(hour, 0, 0, 0);
  candidate.setDate(candidate.getDate() - ((local.getDay() - dayOfWeek + WEEK_DAYS) % WEEK_DAYS));
  if (candidate.getTime() > local.getTime()) candidate.setDate(candidate.getDate() - WEEK_DAYS);
  if (frequency === "biweekly" && !isBiweeklyOnCadence(candidate)) candidate.setDate(candidate.getDate() - WEEK_DAYS);
  return fromZonedTime(candidate, timeZone);
}

/**
 * The period a digest generated at `at` summarizes. For a scheduled run (`at`
 * is a fire instant) it is exactly previous fire → this fire. For a manual
 * run mid-period it is the same length, ending at `at`.
 */
export function digestPeriod(at: Date, schedule: DigestSchedule): { start: Date; end: Date; days: number } {
  const fire = latestScheduledFire(at, schedule);
  const previous = latestScheduledFire(new Date(fire.getTime() - 1), schedule);
  const days = Math.round((fire.getTime() - previous.getTime()) / DAY_MS);
  const start = fire.getTime() === at.getTime() ? previous : new Date(at.getTime() - (fire.getTime() - previous.getTime()));
  return { start, end: at, days };
}

/** How the digest refers to its period in titles and copy. */
export function periodWording(frequency: DigestFrequency): {
  titlePrefix: string;
  phrase: string;
} {
  if (frequency === "biweekly") return { titlePrefix: "The last two weeks at NASIHA", phrase: "over the past two weeks" };
  if (frequency === "monthly") return { titlePrefix: "This month at NASIHA", phrase: "this month" };
  return { titlePrefix: "This week at NASIHA", phrase: "this week" };
}
