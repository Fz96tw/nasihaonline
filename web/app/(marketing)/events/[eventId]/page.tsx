import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getPublicEventById } from "@/lib/events-server";
import { EVENT_TYPE_LABELS } from "@/lib/events";
import { buildEventMetaDescription, buildEventPageTitle } from "@/lib/event-seo";
import { buildBreadcrumbJsonLd, buildEventJsonLd } from "@/lib/json-ld";
import { JsonLd } from "@/components/json-ld";
import { PublicEventDetail } from "@/components/events/public-event-detail";
import { BackLink } from "@/components/back-link";

// Full metadata for the public event page (SEO objective 51c2e8d6). Every
// event this resolves is also in sitemap.xml, via the shared
// PUBLIC_EVENT_WHERE.
export async function generateMetadata({ params }: { params: { eventId: string } }): Promise<Metadata> {
  const event = await getPublicEventById(params.eventId);
  if (!event) return { title: "Event not found", robots: { index: false } };

  const title = buildEventPageTitle(event);
  const description = buildEventMetaDescription({
    description: event.description,
    typeLabel: EVENT_TYPE_LABELS[event.type],
    startsAt: event.startsAt,
    hostName: event.hostName,
  });
  const path = `/events/${event.id}`;
  // A page that sets openGraph replaces the root layout's wholesale, so the
  // default share card has to be restated (see lib/seo.ts).
  const ogImage = event.heroImageUrl
    ? { url: event.heroImageUrl, alt: event.title }
    : { url: "/opengraph-image.png", width: 1200, height: 630 };
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { type: "website", url: path, title, description, images: [ogImage] },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [event.heroImageUrl ?? "/twitter-image.png"],
    },
  };
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
      <JsonLd data={buildEventJsonLd(event)} />
      <JsonLd
        data={buildBreadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Events", path: "/events" },
          { name: event.title, path: `/events/${event.id}` },
        ])}
      />
      <BackLink fallbackHref="/events" />

      <PublicEventDetail event={event} />
    </main>
  );
}
