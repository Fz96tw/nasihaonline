import "server-only";
import { db } from "@/lib/db";
import { mergedIntervalMinutes } from "@/lib/meeting-presence";
import { buildRRule, type RecurrenceInput } from "@/lib/recurrence";

/**
 * Nasiha Conference attendance tracking: who was actually in an event's
 * LiveKit room, and for how long. Written from the LiveKit webhook
 * (participant_joined / participant_left / room_finished) and read by the
 * host's post-event attendance checklist (lib/attendance-server.ts), which
 * only lets a member be confirmed for Knowledge Hours once they were in the
 * room for at least MIN_ATTENDANCE_MINUTES (lib/events.ts).
 *
 * Every function here is best-effort from the webhook's point of view: a
 * room that isn't an event's (a 1:1 meeting request's), a guest identity, or
 * a member who's since been deleted is skipped, never thrown — the webhook
 * route must never 500 on a payload it doesn't like.
 */

/**
 * The occurrence (session start) a moment in time belongs to: the event's own
 * startsAt for a one-off event; for a recurring series, the session in
 * progress at `at` (one event-duration of lookback, an hour if the event has
 * no end) or else the next one — so joining a few minutes early counts toward
 * the session about to start. Same rule as the feed's date badge
 * (feedEventWindow in lib/feed-server.ts).
 */
export function occurrenceStartAt(
  event: { startsAt: Date; endsAt: Date | null; recurrence: RecurrenceInput | null },
  at: Date,
): Date {
  if (!event.recurrence) return event.startsAt;
  const durationMs = event.endsAt ? event.endsAt.getTime() - event.startsAt.getTime() : 60 * 60_000;
  const rule = buildRRule(event.recurrence, event.startsAt);
  return rule.after(new Date(at.getTime() - durationMs), true) ?? rule.before(at, true) ?? event.startsAt;
}

export async function recordParticipantJoined(params: {
  roomName: string;
  identity: string;
  participantSid: string;
  joinedAt: Date;
}): Promise<void> {
  const { roomName, identity, participantSid, joinedAt } = params;
  // Guests get an ephemeral `guest-<uuid>` identity (see the event meeting
  // token route) — no account to credit, so nothing to record.
  if (identity.startsWith("guest-")) return;

  const event = await db.event.findFirst({
    where: { livekitRoomName: roomName },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      recurrence: { select: { frequency: true, interval: true, byWeekday: true, until: true } },
    },
  });
  if (!event) return;

  const user = await db.user.findUnique({ where: { id: identity }, select: { id: true } });
  if (!user) return;

  // Keyed on the participant sid, so a redelivered webhook is a no-op.
  await db.meetingPresence.upsert({
    where: { participantSid },
    create: {
      eventId: event.id,
      userId: user.id,
      occurrenceDate: occurrenceStartAt(event, joinedAt),
      participantSid,
      joinedAt,
    },
    update: {},
  });
}

export async function recordParticipantLeft(participantSid: string, leftAt: Date): Promise<void> {
  await db.meetingPresence.updateMany({ where: { participantSid, leftAt: null }, data: { leftAt } });
}

/** room_finished: closes any connection whose participant_left never arrived, so it doesn't count as "still here" forever. */
export async function closeOpenPresences(roomName: string, at: Date): Promise<void> {
  await db.meetingPresence.updateMany({
    where: { leftAt: null, event: { livekitRoomName: roomName } },
    data: { leftAt: at },
  });
}

/**
 * Whole minutes each member spent in one occurrence's meeting — the union of
 * their connections (a rejoin, or two devices at once, never double-counts),
 * with a still-open connection counted up to now. Also reports whether any
 * presence was recorded for the occurrence at all: an occurrence held before
 * tracking existed has none, and the attendance checklist treats that as
 * "no data" rather than "nobody attended".
 */
export async function getPresenceMinutes(
  eventId: string,
  occurrenceDate: Date,
): Promise<{ tracked: boolean; minutesByUser: Map<string, number> }> {
  const rows = await db.meetingPresence.findMany({
    where: { eventId, occurrenceDate },
    select: { userId: true, joinedAt: true, leftAt: true },
    orderBy: { joinedAt: "asc" },
  });

  const now = Date.now();
  const intervalsByUser = new Map<string, Array<[number, number]>>();
  for (const row of rows) {
    const end = row.leftAt?.getTime() ?? now;
    const list = intervalsByUser.get(row.userId) ?? [];
    list.push([row.joinedAt.getTime(), Math.max(end, row.joinedAt.getTime())]);
    intervalsByUser.set(row.userId, list);
  }

  const minutesByUser = new Map<string, number>();
  intervalsByUser.forEach((intervals, userId) => minutesByUser.set(userId, mergedIntervalMinutes(intervals)));

  return { tracked: rows.length > 0, minutesByUser };
}
