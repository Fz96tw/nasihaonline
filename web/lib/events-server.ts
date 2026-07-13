import "server-only";
import { db } from "@/lib/db";
import { RSVPStatus } from "@/lib/generated/prisma/enums";
import type { EventWithRsvp, MemberEvent, PublicEvent } from "@/lib/events";

// The server-side enforcement point for public event visibility (§4.6):
// meetingUrl and deidentificationConfirmed are never selected here, so no
// caller of this function — page or API route — can leak them to an
// unauthenticated visitor by accident. Member-only fields (RSVP state, the
// gated meeting link) are added by a later objective's own query, not this
// one.
export async function getPublicUpcomingEvents(): Promise<PublicEvent[]> {
  const events = await db.event.findMany({
    where: { startsAt: { gte: new Date() } },
    select: {
      id: true,
      title: true,
      description: true,
      type: true,
      startsAt: true,
      endsAt: true,
      open: true,
      icon: true,
      host: { select: { name: true } },
    },
    orderBy: { startsAt: "asc" },
  });

  return events.map((event) => ({
    id: event.id,
    title: event.title,
    description: event.description,
    type: event.type,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt?.toISOString() ?? null,
    open: event.open,
    icon: event.icon,
    hostName: event.host.name,
  }));
}

// /events for a signed-in viewer (§4.6): same public fields — meetingUrl is
// still never selected here, so a member who hasn't RSVP'd (or RSVP'd but
// is viewing the public listing rather than /calendar) can't see it — plus
// this viewer's own RSVP state, so the "Join to RSVP" CTA can drive an
// actual RSVP toggle for members-only events. userId null (no session)
// always yields rsvped: false.
export async function getEventsForViewer(userId: string | null): Promise<EventWithRsvp[]> {
  const events = await db.event.findMany({
    where: { startsAt: { gte: new Date() } },
    select: {
      id: true,
      title: true,
      description: true,
      type: true,
      startsAt: true,
      endsAt: true,
      open: true,
      icon: true,
      host: { select: { name: true } },
      rsvps: userId ? { where: { userId, status: RSVPStatus.going }, select: { id: true } } : false,
    },
    orderBy: { startsAt: "asc" },
  });

  return events.map((event) => ({
    id: event.id,
    title: event.title,
    description: event.description,
    type: event.type,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt?.toISOString() ?? null,
    open: event.open,
    icon: event.icon,
    hostName: event.host.name,
    rsvped: userId ? event.rsvps.length > 0 : false,
  }));
}

// /calendar (§4.6) — the one place meetingUrl is ever exposed, and only for
// events this member has RSVP'd `going` to. meetingUrl is always fetched
// (unlike the public queries above) since gating happens here, per-row,
// rather than by omitting the column.
export async function getMemberUpcomingEvents(userId: string): Promise<MemberEvent[]> {
  const events = await db.event.findMany({
    where: { startsAt: { gte: new Date() } },
    select: {
      id: true,
      title: true,
      description: true,
      type: true,
      startsAt: true,
      endsAt: true,
      open: true,
      icon: true,
      meetingUrl: true,
      host: { select: { name: true } },
      rsvps: { where: { userId, status: RSVPStatus.going }, select: { id: true } },
    },
    orderBy: { startsAt: "asc" },
  });

  return events.map((event) => {
    const rsvped = event.rsvps.length > 0;
    return {
      id: event.id,
      title: event.title,
      description: event.description,
      type: event.type,
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt?.toISOString() ?? null,
      open: event.open,
      icon: event.icon,
      hostName: event.host.name,
      rsvped,
      meetingUrl: rsvped ? event.meetingUrl : null,
    };
  });
}

export class EventRsvpError extends Error {
  constructor(
    public readonly status: 404,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Toggles the current member's RSVP for an event (§4.6's `POST
 * /api/events/:id/rsvp`): first RSVP creates a `going` row, a second call
 * flips it to `cancelled` and back, rather than deleting/recreating —
 * `@@unique([eventId, userId])` makes this a plain upsert. Returns the
 * resulting RSVP state and the meetingUrl now visible to this member (null
 * once cancelled).
 */
export async function rsvpToEvent(
  userId: string,
  eventId: string,
): Promise<{ rsvped: boolean; meetingUrl: string | null }> {
  const event = await db.event.findUnique({ where: { id: eventId }, select: { meetingUrl: true } });
  if (!event) throw new EventRsvpError(404, "Event not found.");

  const existing = await db.rSVP.findUnique({
    where: { eventId_userId: { eventId, userId } },
    select: { status: true },
  });

  const nextStatus =
    existing?.status === RSVPStatus.going ? RSVPStatus.cancelled : RSVPStatus.going;

  await db.rSVP.upsert({
    where: { eventId_userId: { eventId, userId } },
    create: { eventId, userId, status: nextStatus },
    update: { status: nextStatus },
  });

  const rsvped = nextStatus === RSVPStatus.going;
  return { rsvped, meetingUrl: rsvped ? event.meetingUrl : null };
}

function formatIcsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

// Escapes text per RFC 5545 §3.3.11 (backslash, comma, semicolon, newline).
function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
    .replace(/\n/g, "\\n");
}

/**
 * Builds a downloadable .ics for "Add to calendar" (§4.6). `includeMeetingUrl`
 * is decided by the caller (the API route) from the same RSVP gate as
 * getMemberUpcomingEvents — meetingUrl only ever appears in the ICS body for
 * a member who's RSVP'd `going`.
 */
export function buildEventIcs(event: {
  id: string;
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date | null;
  meetingUrl: string | null;
}): string {
  const start = formatIcsDate(event.startsAt);
  const end = formatIcsDate(event.endsAt ?? new Date(event.startsAt.getTime() + 60 * 60 * 1000));
  const descriptionParts = [event.description, event.meetingUrl ? `Join: ${event.meetingUrl}` : null].filter(
    (part): part is string => Boolean(part),
  );

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Nasiha//Events//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${event.id}@nasihaonline`,
    `DTSTAMP:${formatIcsDate(new Date())}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
  ];
  if (descriptionParts.length > 0) {
    lines.push(`DESCRIPTION:${escapeIcsText(descriptionParts.join("\n\n"))}`);
  }
  if (event.meetingUrl) {
    lines.push(`LOCATION:${escapeIcsText(event.meetingUrl)}`);
  }
  lines.push("END:VEVENT", "END:VCALENDAR");

  return lines.join("\r\n");
}

/**
 * Fetches an event and builds its .ics, gating meetingUrl to a `going`
 * RSVP by this viewer — same rule as the /calendar page and the public
 * /events listing, just applied to the file download instead of a page
 * render. `userId` is null for an unauthenticated request.
 */
export async function getEventIcs(eventId: string, userId: string | null): Promise<{ title: string; ics: string } | null> {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { id: true, title: true, description: true, startsAt: true, endsAt: true, meetingUrl: true },
  });
  if (!event) return null;

  let rsvped = false;
  if (userId) {
    const rsvp = await db.rSVP.findUnique({
      where: { eventId_userId: { eventId, userId } },
      select: { status: true },
    });
    rsvped = rsvp?.status === RSVPStatus.going;
  }

  return {
    title: event.title,
    ics: buildEventIcs({ ...event, meetingUrl: rsvped ? event.meetingUrl : null }),
  };
}
