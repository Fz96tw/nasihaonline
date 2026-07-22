import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getPublicEventById } from "@/lib/events-server";
import { PublicEventDetail } from "@/components/events/public-event-detail";
import { BackLink } from "@/components/back-link";

export async function generateMetadata({ params }: { params: { eventId: string } }): Promise<Metadata> {
  const event = await getPublicEventById(params.eventId);
  return { title: event ? `${event.title} — Events — NASIHA` : "Event not found — NASIHA" };
}

/**
 * /events/[eventId] — the signed-out counterpart to /calendar/[eventId],
 * reachable from clicking any event card on the public /events listing,
 * open or members-only. A signed-in member gets sent to the full member
 * detail page (RSVP, meeting link, edit) instead of this trimmed-down
 * view. PublicEventDetail itself branches the CTA on event.open — Register
 * for an open event, "Join to RSVP" for a members-only one.
 */
export default async function PublicEventDetailPage({ params }: { params: { eventId: string } }) {
  const user = await getSessionUser();
  if (user) redirect(`/calendar/${params.eventId}`);

  const event = await getPublicEventById(params.eventId);
  if (!event) notFound();

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-8">
      <BackLink fallbackHref="/events" />

      <PublicEventDetail event={event} />
    </main>
  );
}
