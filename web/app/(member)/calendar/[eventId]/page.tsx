import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getEventAttendanceChecklist } from "@/lib/attendance-server";
import { getEventAttendees, getEventRoster, getMemberEventById } from "@/lib/events-server";
import { getDirectoryMemberById } from "@/lib/members-server";
import { EventDetail } from "@/components/calendar/event-detail";
import { BackLink } from "@/components/back-link";
import { EventVisibility, Role } from "@/lib/generated/prisma/enums";

export async function generateMetadata({ params }: { params: { eventId: string } }): Promise<Metadata> {
  const user = await getSessionUser();
  const event = user ? await getMemberEventById(user.id, params.eventId) : null;
  return { title: event ? `${event.title} — Calendar — NASIHA` : "Event not found — NASIHA" };
}

/** /calendar/[eventId] (§4.6) — single-event detail, member-only like /calendar itself. */
export default async function EventDetailPage({ params }: { params: { eventId: string } }) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const event = await getMemberEventById(user.id, params.eventId);
  if (!event) notFound();

  const isHost = user.id === event.hostId;
  const canEdit = isHost || user.role === Role.admin;
  // Full invitee roster (Objective 02) — visible to every invited member,
  // not just the organizer, so it's fetched independently of `canEdit`.
  // Only restricted events have one; reaching this point at all already
  // means the viewer is the organizer or an invited member (getMemberEventById's
  // own visibility gate), so no further permission check is needed here.
  const isRestricted = event.visibility === EventVisibility.invited;
  // Attendance checklist (Objective 04) — host/admin only, and only once
  // the event has actually happened, same startsAt < now gate the admin
  // queue's getPastEventsForAttendance() already uses.
  const isPast = new Date(event.startsAt) < new Date();
  const [attendees, hostProfile, roster, attendanceChecklist] = await Promise.all([
    canEdit ? getEventAttendees(event.id) : Promise.resolve(null),
    getDirectoryMemberById(event.hostId),
    isRestricted ? getEventRoster(event.id) : Promise.resolve(null),
    canEdit && isRestricted && isPast ? getEventAttendanceChecklist(event.id) : Promise.resolve(null),
  ]);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-8">
      <BackLink fallbackHref="/calendar" />

      <EventDetail
        event={event}
        canEdit={canEdit}
        isHost={isHost}
        attendees={attendees}
        hostProfile={hostProfile}
        roster={roster}
        attendanceChecklist={attendanceChecklist}
      />
    </main>
  );
}
