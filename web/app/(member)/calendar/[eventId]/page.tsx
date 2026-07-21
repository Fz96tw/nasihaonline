import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getEventAttendees, getMemberEventById } from "@/lib/events-server";
import { getDirectoryMemberById } from "@/lib/members-server";
import { EventDetail } from "@/components/calendar/event-detail";
import { BackLink } from "@/components/back-link";
import { Role } from "@/lib/generated/prisma/enums";

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

  const canEdit = user.id === event.hostId || user.role === Role.admin;
  const [attendees, hostProfile] = await Promise.all([
    canEdit ? getEventAttendees(event.id) : Promise.resolve(null),
    getDirectoryMemberById(event.hostId),
  ]);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-8">
      <BackLink fallbackHref="/calendar" />

      <EventDetail event={event} canEdit={canEdit} attendees={attendees} hostProfile={hostProfile} />
    </main>
  );
}
