import "server-only";
import { db } from "@/lib/db";
import {
  AttendanceRole,
  ContributionSource,
  LedgerStatus,
  LedgerTransactionType,
  NotificationType,
  Role,
} from "@/lib/generated/prisma/enums";
import type { UserModel } from "@/lib/generated/prisma/models/User";
import { createNotification } from "@/lib/notifications-server";
import { formatHours } from "@/lib/contributions";
import type { PastEventForAttendance } from "@/lib/events";

/** The rate-card key that prices hosting an event (§4.4, seeded in prisma/seed.ts). */
const HOST_EVENT_ACTIVITY_KEY = "lecture_webinar";

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
