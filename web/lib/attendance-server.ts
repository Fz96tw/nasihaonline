import "server-only";
import { db } from "@/lib/db";
import {
  AttendanceRole,
  ContributionSource,
  EventVisibility,
  LedgerStatus,
  LedgerTransactionType,
  NotificationType,
  Role,
} from "@/lib/generated/prisma/enums";
import type { UserModel } from "@/lib/generated/prisma/models/User";
import { createNotification } from "@/lib/notifications-server";
import { formatHours } from "@/lib/contributions";
import { getProfileAvatarUrl } from "@/lib/storage";
import { MIN_ATTENDANCE_MINUTES, type AttendanceChecklistMember, type PastEventForAttendance } from "@/lib/events";
import { expandOccurrences, type RecurrenceInput } from "@/lib/recurrence";
import { getPresenceMinutes } from "@/lib/meeting-presence-server";

/** The rate-card key that prices hosting an event (§4.4, seeded in prisma/seed.ts). */
const HOST_EVENT_ACTIVITY_KEY = "lecture_webinar";
// Audience-Restricted Group Events, Objective 04: rate for an invited
// member's own attendance earn — reuses the same "knowledge_discussion"
// rate (0.5h) the 1:1 MeetingRequest flow's recipient already earns
// (web/lib/meeting-requests-server.ts), the recommended default from the
// objective rather than a new dedicated activity key, since it's already
// seeded/active and reads naturally as "a discussion you took part in."
const ATTENDEE_EVENT_ACTIVITY_KEY = "knowledge_discussion";

export class AttendanceError extends Error {
  constructor(
    public readonly status: 400 | 403 | 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Past events (already started), newest-session-first, for the admin
 * attendance-recording queue (§4.4/§4.6). A recurring event expands into
 * one queue row per past occurrence (bounded [event.startsAt, now], capped
 * per series) — each independently flagged by matching a host-role
 * Attendance row's occurrenceDate, since a recurring host earns Knowledge
 * Hours once per session, not once for the whole series.
 */
export async function getPastEventsForAttendance(): Promise<PastEventForAttendance[]> {
  const now = new Date();
  const events = await db.event.findMany({
    where: { OR: [{ startsAt: { lt: now } }, { recurrence: { isNot: null } }] },
    select: {
      id: true,
      title: true,
      type: true,
      startsAt: true,
      endsAt: true,
      hostId: true,
      host: { select: { name: true } },
      recurrence: { select: { frequency: true, interval: true, byWeekday: true, until: true } },
      attendances: { where: { role: AttendanceRole.host }, select: { occurrenceDate: true } },
    },
    orderBy: { startsAt: "desc" },
    take: 100,
  });

  const rows: PastEventForAttendance[] = [];
  for (const event of events) {
    const recordedDates = new Set(event.attendances.map((row) => row.occurrenceDate.getTime()));
    if (!event.recurrence) {
      if (event.startsAt >= now) continue;
      rows.push({
        id: event.id,
        seriesId: event.id,
        occurrenceDate: event.startsAt.toISOString(),
        title: event.title,
        type: event.type,
        startsAt: event.startsAt.toISOString(),
        hostId: event.hostId,
        hostName: event.host.name,
        attendanceRecorded: recordedDates.has(event.startsAt.getTime()),
        isRecurring: false,
      });
      continue;
    }

    const recurrenceInput: RecurrenceInput = {
      frequency: event.recurrence.frequency,
      interval: event.recurrence.interval,
      byWeekday: event.recurrence.byWeekday,
      until: event.recurrence.until,
    };
    const occurrences = expandOccurrences(event, recurrenceInput, event.startsAt, now, { limit: 100 });
    for (const occurrence of occurrences) {
      if (occurrence.occurrenceStart >= now) continue;
      rows.push({
        id: occurrence.occurrenceId,
        seriesId: event.id,
        occurrenceDate: occurrence.occurrenceStart.toISOString(),
        title: event.title,
        type: event.type,
        startsAt: occurrence.occurrenceStart.toISOString(),
        hostId: event.hostId,
        hostName: event.host.name,
        attendanceRecorded: recordedDates.has(occurrence.occurrenceStart.getTime()),
        isRecurring: true,
      });
    }
  }

  return rows.sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());
}

/**
 * Records the host's Attendance for an event and auto-posts the confirmed
 * Knowledge Hours earn transaction it triggers (§4.4/§4.6) — no separate
 * confirmation step, since a host or admin recording this is itself the
 * system's ground truth. Either the event's own host or an admin may record
 * it. Uses the "Lecture / webinar delivered" rate card for every event type,
 * since that's the only host-earn activity §4.4's table defines.
 *
 * All three writes (Attendance, ContributionEvent, ContributionLedger) plus
 * the notification happen in one transaction, and ContributionEvent.attendanceId
 * links back to the Attendance row for the audit trail — the same
 * one-transaction, linked-record shape resolveMeetingRequest() uses for its
 * auto-spend.
 */
export async function recordHostAttendance(
  eventId: string,
  occurrenceDate: Date,
  actingUser: UserModel,
): Promise<{ attendanceId: string; ledgerEntryId: string; hoursEarned: number }> {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { id: true, title: true, hostId: true },
  });
  if (!event) throw new AttendanceError(404, "Event not found.");

  const isAdmin = actingUser.role === Role.admin;
  const isHost = event.hostId === actingUser.id;
  if (!isAdmin && !isHost) {
    throw new AttendanceError(403, "Only the event's host or an admin can record attendance.");
  }

  const existing = await db.attendance.findUnique({
    where: { eventId_userId_occurrenceDate: { eventId, userId: event.hostId, occurrenceDate } },
  });
  if (existing) {
    throw new AttendanceError(409, "Attendance has already been recorded for this event's host.");
  }

  const rule = await db.contributionRule.findUnique({ where: { activityKey: HOST_EVENT_ACTIVITY_KEY } });
  if (!rule || !rule.active || rule.type !== LedgerTransactionType.earned) {
    throw new AttendanceError(409, "The hosting rate isn't configured.");
  }

  return db.$transaction(async (tx) => {
    const attendance = await tx.attendance.create({
      data: { eventId, userId: event.hostId, role: AttendanceRole.host, occurrenceDate },
    });

    const contributionEvent = await tx.contributionEvent.create({
      data: {
        ruleId: rule.id,
        actorId: event.hostId,
        note: `Hosted: ${event.title}`,
        source: ContributionSource.event_attendance,
        attendanceId: attendance.id,
      },
    });

    const ledgerEntry = await tx.contributionLedger.create({
      data: {
        userId: event.hostId,
        eventId: contributionEvent.id,
        type: LedgerTransactionType.earned,
        status: LedgerStatus.confirmed,
        hours: rule.hours,
      },
    });

    await createNotification(
      {
        recipientId: event.hostId,
        type: NotificationType.contribution_awarded,
        message: `You earned ${formatHours(rule.hours.toNumber())} Knowledge Hours for hosting "${event.title}"`,
        link: "/contributions",
      },
      tx,
    );

    return { attendanceId: attendance.id, ledgerEntryId: ledgerEntry.id, hoursEarned: rule.hours.toNumber() };
  });
}

/**
 * The host-facing post-event attendance checklist (Audience-Restricted Group
 * Events, Objective 04, extended to every Nasiha Conference event):
 * - a Nasiha Conference (LiveKit) event lists every member who joined the
 *   meeting, with the minutes they were in it (lib/meeting-presence-server.ts);
 *   only those with at least MIN_ATTENDANCE_MINUTES can be confirmed;
 * - a restricted event also lists every invitee, joined or not. Where there's
 *   no meeting data for the session (a Meet/in-person event, or a LiveKit
 *   session from before tracking existed) the host's word is all there is,
 *   so an invitee stays confirmable as before.
 * The host is never listed — their own hours go through the admin queue.
 * The host, a co-host or an admin may confirm (recordAttendeeAttendance);
 * a co-host's own row is flagged isSelf, since only an admin confirms
 * their own credit.
 * Caller enforces the access gate (same "caller enforces" convention as
 * getEventAttendees/getEventRoster) — the page only renders this for a past
 * event the viewer can edit.
 */
export async function getEventAttendanceChecklist(
  eventId: string,
  occurrenceDate: Date,
  viewer: { id: string; role: Role },
): Promise<AttendanceChecklistMember[]> {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { hostId: true, visibility: true, livekitRoomName: true },
  });
  if (!event) return [];
  const isRestricted = event.visibility === EventVisibility.invited;
  const isLiveKit = Boolean(event.livekitRoomName);

  const [invitees, recorded, presence] = await Promise.all([
    isRestricted
      ? db.eventInvitee.findMany({ where: { eventId }, select: { userId: true }, orderBy: { createdAt: "asc" } })
      : Promise.resolve([]),
    db.attendance.findMany({
      where: { eventId, role: AttendanceRole.attendee, occurrenceDate },
      select: { userId: true },
    }),
    isLiveKit ? getPresenceMinutes(eventId, occurrenceDate) : Promise.resolve(null),
  ]);

  const tracked = presence?.tracked ?? false;
  const minutesByUser = presence?.minutesByUser ?? new Map<string, number>();
  const invitedIds = new Set(invitees.map((invitee) => invitee.userId));
  const recordedIds = new Set(recorded.map((row) => row.userId));

  // Joined members first (longest stay first), then invitees who never joined.
  const joinedIds = Array.from(minutesByUser.keys()).sort((a, b) => minutesByUser.get(b)! - minutesByUser.get(a)!);
  const candidateIds = Array.from(new Set([...joinedIds, ...invitees.map((invitee) => invitee.userId)])).filter(
    (userId) => userId !== event.hostId,
  );
  if (candidateIds.length === 0) return [];

  const users = await db.user.findMany({
    where: { id: { in: candidateIds } },
    select: { id: true, name: true, profile: { select: { avatarUrl: true } } },
  });
  const usersById = new Map(users.map((user) => [user.id, user]));

  return candidateIds.flatMap((userId) => {
    const user = usersById.get(userId);
    if (!user) return [];
    const minutesAttended = tracked ? (minutesByUser.get(userId) ?? 0) : null;
    return [
      {
        userId,
        name: user.name,
        avatarUrl: getProfileAvatarUrl(user.profile?.avatarUrl ?? null),
        recorded: recordedIds.has(userId),
        minutesAttended,
        eligible: minutesAttended !== null ? minutesAttended >= MIN_ATTENDANCE_MINUTES : invitedIds.has(userId),
        isSelf: userId === viewer.id && viewer.role !== Role.admin,
      },
    ];
  });
}

/**
 * Records one member's attendee Attendance and auto-posts their confirmed
 * Knowledge Hours earn (Audience-Restricted Group Events, Objective 04,
 * extended to every Nasiha Conference event) — parallel to but distinct
 * from recordHostAttendance() above, which stays exactly as-is for the
 * host's own row. Single-action, same "recording is itself the
 * confirmation" shape as the host's own entry — the host, a co-host or an
 * admin is the one calling this, and only an admin may mark themselves, so
 * there's no self-report risk. Who qualifies mirrors getEventAttendanceChecklist: on a
 * Nasiha Conference session with meeting data, at least
 * MIN_ATTENDANCE_MINUTES in the room; otherwise (no data) only a restricted
 * event's invitee.
 */
export async function recordAttendeeAttendance(
  eventId: string,
  targetUserId: string,
  occurrenceDate: Date,
  actingUser: UserModel,
): Promise<{ attendanceId: string; ledgerEntryId: string; hoursEarned: number }> {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { id: true, title: true, hostId: true, visibility: true, startsAt: true, livekitRoomName: true },
  });
  if (!event) throw new AttendanceError(404, "Event not found.");

  const isRestricted = event.visibility === EventVisibility.invited;
  const isLiveKit = Boolean(event.livekitRoomName);
  if (!isRestricted && !isLiveKit) {
    throw new AttendanceError(400, "Attendance credit is only tracked for Nasiha Conference and restricted events.");
  }

  const isAdmin = actingUser.role === Role.admin;
  const isHost = event.hostId === actingUser.id;
  // Co-hosts exist only on Nasiha Conference events (EventCoHost).
  const isCoHost =
    !isAdmin &&
    !isHost &&
    isLiveKit &&
    (await db.eventCoHost.findUnique({
      where: { eventId_userId: { eventId, userId: actingUser.id } },
      select: { id: true },
    })) !== null;
  if (!isAdmin && !isHost && !isCoHost) {
    throw new AttendanceError(403, "Only the event's host, a co-host or an admin can record attendance.");
  }
  if (!isAdmin && targetUserId === actingUser.id) {
    throw new AttendanceError(403, "You can't confirm your own attendance — ask the host or an admin.");
  }

  if (occurrenceDate >= new Date()) {
    throw new AttendanceError(409, "Attendance can only be recorded after the event has happened.");
  }

  if (targetUserId === event.hostId) {
    throw new AttendanceError(400, "The host's own hours are recorded separately.");
  }

  const presence = isLiveKit ? await getPresenceMinutes(eventId, occurrenceDate) : null;
  if (presence?.tracked) {
    const minutes = presence.minutesByUser.get(targetUserId) ?? 0;
    if (minutes < MIN_ATTENDANCE_MINUTES) {
      throw new AttendanceError(
        409,
        `This member was in the meeting for ${minutes} min — attendance credit needs at least ${MIN_ATTENDANCE_MINUTES}.`,
      );
    }
  } else {
    const invited = isRestricted
      ? await db.eventInvitee.findUnique({
          where: { eventId_userId: { eventId, userId: targetUserId } },
          select: { userId: true },
        })
      : null;
    if (!invited) {
      throw new AttendanceError(
        400,
        isRestricted ? "This member wasn't invited to this event." : "There's no meeting attendance recorded for this session.",
      );
    }
  }

  const existing = await db.attendance.findUnique({
    where: { eventId_userId_occurrenceDate: { eventId, userId: targetUserId, occurrenceDate } },
  });
  if (existing) {
    throw new AttendanceError(409, "Attendance has already been recorded for this member.");
  }

  const rule = await db.contributionRule.findUnique({ where: { activityKey: ATTENDEE_EVENT_ACTIVITY_KEY } });
  if (!rule || !rule.active || rule.type !== LedgerTransactionType.earned) {
    throw new AttendanceError(409, "The attendee earn rate isn't configured.");
  }

  return db.$transaction(async (tx) => {
    const attendance = await tx.attendance.create({
      data: { eventId, userId: targetUserId, role: AttendanceRole.attendee, occurrenceDate },
    });

    const contributionEvent = await tx.contributionEvent.create({
      data: {
        ruleId: rule.id,
        actorId: targetUserId,
        note: `Attended: ${event.title}`,
        source: ContributionSource.event_attendance,
        attendanceId: attendance.id,
      },
    });

    const ledgerEntry = await tx.contributionLedger.create({
      data: {
        userId: targetUserId,
        eventId: contributionEvent.id,
        type: LedgerTransactionType.earned,
        status: LedgerStatus.confirmed,
        hours: rule.hours,
      },
    });

    await createNotification(
      {
        recipientId: targetUserId,
        type: NotificationType.contribution_awarded,
        message: `You earned ${formatHours(rule.hours.toNumber())} Knowledge Hours for attending "${event.title}"`,
        link: "/contributions",
      },
      tx,
    );

    return { attendanceId: attendance.id, ledgerEntryId: ledgerEntry.id, hoursEarned: rule.hours.toNumber() };
  });
}
