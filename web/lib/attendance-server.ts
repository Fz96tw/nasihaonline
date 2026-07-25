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
import type { AttendanceChecklistMember, PastEventForAttendance } from "@/lib/events";

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

/** Past events (already started), newest-started-first, for the admin attendance-recording queue (§4.4/§4.6). */
export async function getPastEventsForAttendance(): Promise<PastEventForAttendance[]> {
  const events = await db.event.findMany({
    where: { startsAt: { lt: new Date() } },
    select: {
      id: true,
      title: true,
      type: true,
      startsAt: true,
      hostId: true,
      host: { select: { name: true } },
      attendances: { where: { role: AttendanceRole.host }, select: { id: true } },
    },
    orderBy: { startsAt: "desc" },
    take: 100,
  });

  return events.map((event) => ({
    id: event.id,
    title: event.title,
    type: event.type,
    startsAt: event.startsAt.toISOString(),
    hostId: event.hostId,
    hostName: event.host.name,
    attendanceRecorded: event.attendances.length > 0,
  }));
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
    where: { eventId_userId: { eventId, userId: event.hostId } },
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
      data: { eventId, userId: event.hostId, role: AttendanceRole.host },
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
 * Invited-member checklist for a restricted event's host-facing attendance
 * UI (Audience-Restricted Group Events, Objective 04) — every EventInvitee,
 * flagged with whether their attendee-role Attendance row already exists.
 * Caller enforces the access gate (same "caller enforces" convention as
 * getEventAttendees/getEventRoster) — the page only renders this for a
 * restricted, past event the viewer can already edit.
 */
export async function getEventAttendanceChecklist(eventId: string): Promise<AttendanceChecklistMember[]> {
  const [invitees, recorded] = await Promise.all([
    db.eventInvitee.findMany({
      where: { eventId },
      select: { userId: true, user: { select: { name: true, profile: { select: { avatarUrl: true } } } } },
      orderBy: { createdAt: "asc" },
    }),
    db.attendance.findMany({
      where: { eventId, role: AttendanceRole.attendee },
      select: { userId: true },
    }),
  ]);

  const recordedIds = new Set(recorded.map((row) => row.userId));
  return invitees.map((invitee) => ({
    userId: invitee.userId,
    name: invitee.user.name,
    avatarUrl: getProfileAvatarUrl(invitee.user.profile?.avatarUrl ?? null),
    recorded: recordedIds.has(invitee.userId),
  }));
}

/**
 * Records one invited member's Attendance on a restricted event and
 * auto-posts their confirmed Knowledge Hours earn (Audience-Restricted
 * Group Events, Objective 04) — parallel to but distinct from
 * recordHostAttendance() above, which stays exactly as-is for the host's
 * own row and for community events generally. Single-action, same
 * "recording is itself the confirmation, no separate approval step" shape
 * as the host's own entry — the organizer (or an admin) is the one calling
 * this, marking someone else's attendance, so there's no self-report risk
 * to guard against the way there would be if attendees recorded
 * themselves.
 */
export async function recordAttendeeAttendance(
  eventId: string,
  targetUserId: string,
  actingUser: UserModel,
): Promise<{ attendanceId: string; ledgerEntryId: string; hoursEarned: number }> {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { id: true, title: true, hostId: true, visibility: true, startsAt: true },
  });
  if (!event) throw new AttendanceError(404, "Event not found.");

  if (event.visibility !== EventVisibility.invited) {
    throw new AttendanceError(400, "Only restricted events track attendee attendance separately.");
  }

  const isAdmin = actingUser.role === Role.admin;
  const isHost = event.hostId === actingUser.id;
  if (!isAdmin && !isHost) {
    throw new AttendanceError(403, "Only the event's host or an admin can record attendance.");
  }

  if (event.startsAt >= new Date()) {
    throw new AttendanceError(409, "Attendance can only be recorded after the event has happened.");
  }

  const invited = await db.eventInvitee.findUnique({
    where: { eventId_userId: { eventId, userId: targetUserId } },
    select: { userId: true },
  });
  if (!invited) throw new AttendanceError(400, "This member wasn't invited to this event.");

  const existing = await db.attendance.findUnique({
    where: { eventId_userId: { eventId, userId: targetUserId } },
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
      data: { eventId, userId: targetUserId, role: AttendanceRole.attendee },
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
