import { SITE_URL, SITE_DESCRIPTION, CONTACT_EMAIL } from "@/lib/site";

export function buildOrganizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "NASIHA",
    url: SITE_URL,
    logo: `${SITE_URL}/icon.png`,
    description: SITE_DESCRIPTION,
    contactPoint: {
      "@type": "ContactPoint",
      email: CONTACT_EMAIL,
      contactType: "customer support",
      url: `${SITE_URL}/contact`,
    },
  };
}

export function buildBreadcrumbJsonLd(items: Array<{ name: string; path: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: `${SITE_URL}${item.path}`,
    })),
  };
}

/**
 * Every NASIHA event is online-only — the Event model has no physical
 * address/venue field, just meetingUrl/googleEventId/livekitRoomName — so
 * eventAttendanceMode and location are unconditionally virtual; `type`
 * (webinar/workshop/lecture/...) is a content category, not an attendance
 * mode, and isn't used here.
 */
export function buildEventJsonLd(event: {
  seriesId: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  hostName: string | null;
}) {
  const eventUrl = `${SITE_URL}/events/${event.seriesId}`;

  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    startDate: event.startsAt,
    ...(event.endsAt ? { endDate: event.endsAt } : {}),
    ...(event.description ? { description: event.description } : {}),
    eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
    eventStatus: "https://schema.org/EventScheduled",
    // meetingUrl is never exposed on the public /events listing (gated to
    // RSVP'd members only, see lib/events-server.ts) — the event's own
    // public detail page is what a signed-out visitor, and a crawler, can
    // actually reach, so that's what location.url points at rather than a
    // join link nobody outside the RSVP list can use.
    location: {
      "@type": "VirtualLocation",
      url: eventUrl,
    },
    url: eventUrl,
    organizer: {
      "@type": "Person",
      name: event.hostName ?? "NASIHA",
    },
    image: [`${SITE_URL}/opengraph-image.png`],
  };
}
