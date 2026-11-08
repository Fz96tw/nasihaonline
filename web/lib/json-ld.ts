import { SITE_URL, SITE_DESCRIPTION, CONTACT_EMAIL, SITE_SAME_AS } from "@/lib/site";

/**
 * Stable node id for the site-wide Organization (rendered by the root
 * layout on every page), so WebSite.publisher and Person.worksFor can
 * reference the same entity instead of restating it.
 */
export const ORGANIZATION_ID = `${SITE_URL}/#organization`;

export function buildOrganizationJsonLd(sameAs: string[] = SITE_SAME_AS) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORGANIZATION_ID,
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
    ...(sameAs.length > 0 ? { sameAs } : {}),
  };
}

/**
 * Homepage-only WebSite node. No potentialAction/SearchAction: site search
 * is members-only, and Google only uses a SearchAction whose target URL a
 * signed-out visitor can actually load.
 */
export function buildWebSiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    name: "NASIHA",
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    inLanguage: "en",
    publisher: { "@id": ORGANIZATION_ID },
  };
}

/**
 * One /our-team member. No `image`: TeamMember.photoUrl is served through
 * short-lived signed URLs, which would leave crawlers holding a dead link.
 */
export function buildPersonJsonLd(member: {
  name: string;
  title: string;
  bio: string;
  affiliation: string | null;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: member.name,
    jobTitle: member.title,
    ...(member.bio.trim() ? { description: member.bio.trim() } : {}),
    ...(member.affiliation?.trim()
      ? { affiliation: { "@type": "Organization", name: member.affiliation.trim() } }
      : {}),
    worksFor: { "@id": ORGANIZATION_ID },
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
