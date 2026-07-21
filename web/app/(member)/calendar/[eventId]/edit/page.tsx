import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getEventForEdit } from "@/lib/events-server";
import { SubmitEventForm } from "@/components/calendar/submit-event-form";
import { Role } from "@/lib/generated/prisma/enums";

export const metadata: Metadata = {
  title: "Edit Event — NASIHA",
};

// /calendar/[eventId]/edit (§4.6) — host or admin only. Same "requester
// already knows this id, so a plain 404 for 'not found or not yours' is
// sufficient" rationale as /blog/[slug]/edit.
export default async function EditEventPage({ params }: { params: { eventId: string } }) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const event = await getEventForEdit(params.eventId);
  if (!event) notFound();

  const isAdmin = user.role === Role.admin;
  const isHost = event.hostId === user.id;
  if (!isAdmin && !isHost) notFound();

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Edit Event</h1>
        <p className="text-muted-foreground">Update your event below.</p>
      </div>

      <SubmitEventForm
        existingEvent={{
          id: event.id,
          title: event.title,
          description: event.description,
          type: event.type,
          startsAt: event.startsAt,
          endsAt: event.endsAt,
          open: event.open,
          icon: event.icon,
          meetingUrl: event.meetingUrl,
          heroImageUrl: event.heroImageUrl,
          deidentificationConfirmed: event.deidentificationConfirmed,
        }}
      />
    </main>
  );
}
