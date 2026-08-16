import { RRule, Weekday } from "rrule";
import { RecurrenceFrequency } from "@/lib/generated/prisma/enums";

export type RecurrenceInput = {
  frequency: RecurrenceFrequency;
  /** >= 1 */
  interval: number;
  /** 0=Sun..6=Sat, weekly only, ignored otherwise */
  byWeekday: number[];
  until: Date | null;
};

const FREQUENCY_MAP: Record<RecurrenceFrequency, number> = {
  [RecurrenceFrequency.daily]: RRule.DAILY,
  [RecurrenceFrequency.weekly]: RRule.WEEKLY,
  [RecurrenceFrequency.monthly]: RRule.MONTHLY,
};

// EventRecurrence.byWeekday is 0=Sun..6=Sat (JS Date#getDay() convention).
// rrule's own weekday constants are RFC 5545 order (MO..SU) with different
// internal numbering — map through the named constants directly rather
// than trying to arithmetic-convert between the two schemes.
const WEEKDAY_MAP: Record<number, Weekday> = {
  0: RRule.SU,
  1: RRule.MO,
  2: RRule.TU,
  3: RRule.WE,
  4: RRule.TH,
  5: RRule.FR,
  6: RRule.SA,
};

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Builds an RRule anchored at `dtstart` (always the Event's own startsAt).
 *
 * DST caveat: rrule advances using dtstart's UTC calendar fields, not the
 * organizer's local wall-clock time in their IANA timezone. A weekly
 * "every Tuesday 2pm Eastern" event keeps firing at a fixed UTC instant
 * across a DST transition, which reads as 1pm or 3pm Eastern on the far
 * side instead of a fixed 2pm. Google Calendar's own event start.dateTime
 * is also plain UTC with no timeZone field set (see google-calendar.ts),
 * so our expansion and the Google Calendar entry drift identically —
 * self-consistent, if not organizer-wall-clock-correct. Accepted v1
 * limitation; a real fix needs a timezone-math library (luxon/date-fns-tz,
 * neither installed) and is a follow-up, not addressed here.
 */
export function buildRRule(recurrence: RecurrenceInput, dtstart: Date): RRule {
  return new RRule({
    freq: FREQUENCY_MAP[recurrence.frequency],
    interval: recurrence.interval,
    dtstart,
    ...(recurrence.frequency === RecurrenceFrequency.weekly && recurrence.byWeekday.length > 0
      ? { byweekday: recurrence.byWeekday.map((day) => WEEKDAY_MAP[day]) }
      : {}),
    ...(recurrence.until ? { until: recurrence.until } : {}),
  });
}

/**
 * The exact line Google Calendar's requestBody.recurrence and the .ics
 * RRULE property both expect, e.g.
 * "RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE;UNTIL=20261231T000000Z".
 */
export function buildRRuleString(recurrence: RecurrenceInput, dtstart: Date): string {
  // RRule#toString() emits "DTSTART:...\nRRULE:...". Only the RRULE line
  // is wanted — Google Calendar takes DTSTART separately via
  // requestBody.start, and the .ics builder emits its own DTSTART.
  const [, rruleLine] = buildRRule(recurrence, dtstart).toString().split("\n");
  return rruleLine;
}

export type Occurrence = {
  seriesId: string;
  /** Synthetic id for calendar/list rendering and the ?occurrence= query param — NOT a real Event.id. */
  occurrenceId: string;
  occurrenceStart: Date;
  occurrenceEnd: Date | null;
  isRecurring: true;
};

const OCCURRENCE_ID_SEPARATOR = "::";

/**
 * Expands a recurring event into bounded occurrence instances within
 * [rangeStart, rangeEnd] (inclusive both ends). Each occurrence preserves
 * the master event's original duration, shifted to that occurrence's
 * start. Callers must always pass a bounded rangeEnd — until: null
 * combined with an unbounded range would iterate forever for daily/weekly
 * rules.
 */
export function expandOccurrences(
  event: { id: string; startsAt: Date; endsAt: Date | null },
  recurrence: RecurrenceInput,
  rangeStart: Date,
  rangeEnd: Date,
  opts?: { limit?: number },
): Occurrence[] {
  const rule = buildRRule(recurrence, event.startsAt);
  const durationMs = event.endsAt ? event.endsAt.getTime() - event.startsAt.getTime() : null;
  const starts = rule.between(rangeStart, rangeEnd, true);
  const bounded = opts?.limit ? starts.slice(0, opts.limit) : starts;
  return bounded.map((occurrenceStart) => ({
    seriesId: event.id,
    occurrenceId: `${event.id}${OCCURRENCE_ID_SEPARATOR}${occurrenceStart.toISOString()}`,
    occurrenceStart,
    occurrenceEnd: durationMs !== null ? new Date(occurrenceStart.getTime() + durationMs) : null,
    isRecurring: true as const,
  }));
}

/** Parses a synthetic occurrence id back into its parts — round-trips expandOccurrences' format. */
export function parseOccurrenceId(occurrenceId: string): { seriesId: string; occurrenceStart: Date } | null {
  const separatorIndex = occurrenceId.indexOf(OCCURRENCE_ID_SEPARATOR);
  if (separatorIndex === -1) return null;
  const seriesId = occurrenceId.slice(0, separatorIndex);
  const occurrenceStart = new Date(occurrenceId.slice(separatorIndex + OCCURRENCE_ID_SEPARATOR.length));
  if (Number.isNaN(occurrenceStart.getTime())) return null;
  return { seriesId, occurrenceStart };
}

/**
 * Human-readable summary for form preview text and list/detail badges,
 * e.g. "Weekly on Tue" / "Every 2 weeks on Mon, Wed, until Dec 31, 2026".
 * Fixed "en-US" locale mirrors formatEventDateTime's convention
 * (lib/format-date.ts) so SSR/client output never hydration-mismatches.
 */
export function describeRecurrence(recurrence: RecurrenceInput): string {
  let base: string;
  if (recurrence.frequency === RecurrenceFrequency.daily) {
    base = recurrence.interval === 1 ? "Daily" : `Every ${recurrence.interval} days`;
  } else if (recurrence.frequency === RecurrenceFrequency.weekly) {
    const days = [...recurrence.byWeekday].sort((a, b) => a - b).map((day) => WEEKDAY_LABELS[day]).join(", ");
    const freqLabel = recurrence.interval === 1 ? "Weekly" : `Every ${recurrence.interval} weeks`;
    base = days ? `${freqLabel} on ${days}` : freqLabel;
  } else {
    base = recurrence.interval === 1 ? "Monthly" : `Every ${recurrence.interval} months`;
  }
  if (!recurrence.until) return base;
  const untilLabel = recurrence.until.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${base}, until ${untilLabel}`;
}
