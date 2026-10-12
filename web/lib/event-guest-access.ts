/**
 * When an anonymous event guest's registration (`?rid=`) stops admitting
 * them to the meeting. Kept free of Prisma/rrule imports so it runs under
 * `node --test`; the caller (getEventMeetingStatus) resolves the series'
 * last occurrence start.
 */

/** Length assumed for an event with no endsAt — matches the Meet/recording default. */
export const DEFAULT_EVENT_DURATION_MS = 30 * 60 * 1000;

/** How long after the (last) occurrence ends a guest link still works — covers overruns and late joiners. */
export const GUEST_ACCESS_GRACE_MS = 2 * 60 * 60 * 1000;

/**
 * Returns the instant guest access ends, or null when it never does (a
 * recurring series with no end date).
 *
 * `lastOccurrenceStart` is the start of the final occurrence — `startsAt`
 * for a one-off event, the last rule date on or before `until` for a
 * bounded series, or null for an unbounded series.
 */
export function guestAccessEndsAt(input: {
  startsAt: Date;
  endsAt: Date | null;
  lastOccurrenceStart: Date | null;
}): Date | null {
  if (input.lastOccurrenceStart === null) return null;
  const durationMs = input.endsAt
    ? Math.max(0, input.endsAt.getTime() - input.startsAt.getTime())
    : DEFAULT_EVENT_DURATION_MS;
  return new Date(input.lastOccurrenceStart.getTime() + durationMs + GUEST_ACCESS_GRACE_MS);
}

export function guestAccessExpired(
  input: { startsAt: Date; endsAt: Date | null; lastOccurrenceStart: Date | null },
  now: Date = new Date(),
): boolean {
  const endsAt = guestAccessEndsAt(input);
  return endsAt !== null && now.getTime() > endsAt.getTime();
}
