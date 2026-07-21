import "server-only";
import { db } from "@/lib/db";
import { EventType, Role, RSVPStatus } from "@/lib/generated/prisma/enums";
import type { UserModel } from "@/lib/generated/prisma/models/User";
import type {
  DashboardUpcomingEvent,
  EventRegistrationAttendee,
  EventRsvpAttendee,
  EventWithRsvp,
  MemberEvent,
  PublicEvent,
} from "@/lib/events";
import { EVENTS_FORUM_SLUG } from "@/lib/forums";
import {
  deleteEventHeroImage,
  getEventHeroImageUrl,
  uploadEventHeroImage,
  UploadValidationError,
} from "@/lib/storage";

// Absolute, not relative — the auto-created discussion thread's first post
// (createEvent, below) needs a real URL for lib/linkify.tsx's linkifyText
// to turn into a clickable link; it only matches absolute http(s) URLs.
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";

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
      heroImageUrl: true,
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
    heroImageUrl: getEventHeroImageUrl(event.heroImageUrl),
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
      heroImageUrl: true,
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
    heroImageUrl: getEventHeroImageUrl(event.heroImageUrl),
    hostName: event.host.name,
    rsvped: userId ? event.rsvps.length > 0 : false,
  }));
}

// /calendar (§4.6) — the one place meetingUrl is ever exposed, and only for
// events this member has RSVP'd `going` to. meetingUrl is always fetched
// (unlike the public queries above) since gating happens here, per-row,
// rather than by omitting the column.
//
// Deliberately not filtered by startsAt — the Month tab needs to keep
// showing past events when browsing to earlier months (and past events
// earlier in the current month), not just what's still upcoming. The
// "Upcoming List" tab derives its own future-only view client-side
// (CalendarView) rather than this query doing it server-side.
export async function getMemberEvents(userId: string): Promise<MemberEvent[]> {
  const events = await db.event.findMany({
    select: {
      id: true,
      title: true,
      description: true,
      type: true,
      startsAt: true,
      endsAt: true,
      open: true,
      icon: true,
      heroImageUrl: true,
      meetingUrl: true,
      forumThread: { select: { id: true, _count: { select: { posts: true } } } },
      hostId: true,
      host: { select: { name: true } },
      rsvps: { where: { userId, status: RSVPStatus.going }, select: { id: true } },
      // Going RSVPs (members) plus EventRegistrations (non-members) — same
      // merge as getEventEngagementForAdmin's attendee/interest count.
      _count: {
        select: {
          rsvps: { where: { status: RSVPStatus.going } },
          registrations: true,
        },
      },
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
      heroImageUrl: getEventHeroImageUrl(event.heroImageUrl),
      hostId: event.hostId,
      hostName: event.host.name,
      rsvped,
      meetingUrl: rsvped ? event.meetingUrl : null,
      attendeeCount: event._count.rsvps + event._count.registrations,
      forumThreadId: event.forumThread?.id ?? null,
      forumReplyCount: event.forumThread ? event.forumThread._count.posts - 1 : null,
    };
  });
}

// /calendar/[eventId] — single-event detail view. Not filtered by startsAt
// so a past event reached via an "Add to calendar" link, email reminder, or
// direct navigation still resolves instead of 404ing once its start time
// has passed.
export async function getMemberEventById(userId: string, eventId: string): Promise<MemberEvent | null> {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      title: true,
      description: true,
      type: true,
      startsAt: true,
      endsAt: true,
      open: true,
      icon: true,
      heroImageUrl: true,
      meetingUrl: true,
      forumThread: { select: { id: true, _count: { select: { posts: true } } } },
      hostId: true,
      host: { select: { name: true } },
      rsvps: { where: { userId, status: RSVPStatus.going }, select: { id: true } },
      _count: {
        select: {
          rsvps: { where: { status: RSVPStatus.going } },
          registrations: true,
        },
      },
    },
  });
  if (!event) return null;

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
    heroImageUrl: getEventHeroImageUrl(event.heroImageUrl),
    hostId: event.hostId,
    hostName: event.host.name,
    rsvped,
    meetingUrl: rsvped ? event.meetingUrl : null,
    attendeeCount: event._count.rsvps + event._count.registrations,
    forumThreadId: event.forumThread?.id ?? null,
    forumReplyCount: event.forumThread ? event.forumThread._count.posts - 1 : null,
  };
}

/**
 * /calendar/[eventId]'s host/admin-only attendee list (§4.6) — the page
 * itself gates who this is fetched for; this function doesn't re-check
 * authorization, same "caller enforces the gate" division as
 * getEventForEdit.
 */
export async function getEventAttendees(
  eventId: string,
): Promise<{ rsvps: EventRsvpAttendee[]; registrations: EventRegistrationAttendee[] }> {
  const [rsvps, registrations] = await Promise.all([
    db.rSVP.findMany({
      where: { eventId, status: RSVPStatus.going },
      select: { id: true, user: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.eventRegistration.findMany({
      where: { eventId },
      select: { id: true, name: true, email: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return {
    rsvps: rsvps.map((rsvp) => ({ id: rsvp.id, name: rsvp.user.name })),
    registrations: registrations.map((registration) => ({
      id: registration.id,
      name: registration.name,
      email: registration.email,
    })),
  };
}

// Dashboard's upcoming-events widget (§10 Phase 4 capstone): this member's
// RSVP'd-going events plus any open events they haven't RSVP'd to, capped to
// a short at-a-glance list rather than the full /calendar view.
export async function getDashboardUpcomingEvents(
  userId: string,
  limit = 3,
): Promise<DashboardUpcomingEvent[]> {
  const events = await db.event.findMany({
    where: {
      startsAt: { gte: new Date() },
      OR: [{ open: true }, { rsvps: { some: { userId, status: RSVPStatus.going } } }],
    },
    select: {
      id: true,
      title: true,
      type: true,
      startsAt: true,
      rsvps: { where: { userId, status: RSVPStatus.going }, select: { id: true } },
    },
    orderBy: { startsAt: "asc" },
    take: limit,
  });

  return events.map((event) => ({
    id: event.id,
    title: event.title,
    type: event.type,
    startsAt: event.startsAt.toISOString(),
    rsvped: event.rsvps.length > 0,
  }));
}

// /admin/event-registrations — a merged view of who's engaged with each
// event: anonymous EventRegistration rows (non-members) plus `going` RSVP
// rows joined to their User (members, tagged with tier so the admin table
// can render a tier badge instead of "Non-member"). Merging these two
// otherwise-separate tables is admin-reporting-only — nothing here feeds
// back into either table. No pagination/date filtering server-side; the
// admin table filters client-side, same as UserTable, since this data is
// expected to stay small.
export async function getEventEngagementForAdmin() {
  const [registrations, rsvps] = await Promise.all([
    db.eventRegistration.findMany({
      include: { event: { select: { title: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.rSVP.findMany({
      where: { status: RSVPStatus.going },
      include: {
        event: { select: { title: true } },
        user: { select: { email: true, name: true, tier: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const guestRows = registrations.map((r) => ({
    id: `registration:${r.id}`,
    eventId: r.eventId,
    eventTitle: r.event.title,
    email: r.email,
    name: r.name,
    createdAt: r.createdAt,
    isMember: false as const,
    tier: null,
  }));

  const memberRows = rsvps.map((r) => ({
    id: `rsvp:${r.id}`,
    eventId: r.eventId,
    eventTitle: r.event.title,
    email: r.user.email,
    name: r.user.name,
    createdAt: r.createdAt,
    isMember: true as const,
    tier: r.user.tier,
  }));

  return [...guestRows, ...memberRows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export class EventError extends Error {
  constructor(
    public readonly status: 400 | 403 | 404,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Creates an Event from a member's "Submit Event" action (§4.6), gated to
 * EVENT_SUBMISSION_TIERS by the caller. The submitting member always
 * becomes the host — there's no host picker — since `Event.host` is also
 * the auto-earn Knowledge Hours trigger on Attendance (§4.4), and letting a
 * submitter name someone else as host would let them credit that person's
 * hours without their involvement.
 */
export async function createEvent(
  hostId: string,
  input: {
    title: string;
    description: string | null;
    type: EventType;
    startsAt: string;
    endsAt: string | null;
    open: boolean;
    icon: string | null;
    meetingUrl: string | null;
    deidentificationConfirmed: boolean;
    heroImage: File | null;
    createDiscussionThread: boolean;
  },
): Promise<{ id: string }> {
  const startsAt = new Date(input.startsAt);
  if (Number.isNaN(startsAt.getTime())) {
    throw new EventError(400, "Start date and time isn't valid.");
  }

  let endsAt: Date | null = null;
  if (input.endsAt) {
    endsAt = new Date(input.endsAt);
    if (Number.isNaN(endsAt.getTime())) {
      throw new EventError(400, "End date and time isn't valid.");
    }
    if (endsAt <= startsAt) {
      throw new EventError(400, "End time must be after the start time.");
    }
  }

  // Belt-and-suspenders: createEventSchema already blocks an unconfirmed
  // Case Discussion client- and server-side, but this is the one place no
  // caller of createEvent — schema-validated or not — can bypass it.
  if (input.type === EventType.case_discussion && !input.deidentificationConfirmed) {
    throw new EventError(400, "Case Discussion events require the de-identification confirmation.");
  }

  let eventsForumId: string | null = null;
  if (input.createDiscussionThread) {
    const eventsForum = await db.forum.findUnique({ where: { slug: EVENTS_FORUM_SLUG }, select: { id: true } });
    if (!eventsForum) {
      throw new EventError(400, "The Events discussion forum isn't set up yet — contact an admin.");
    }
    eventsForumId = eventsForum.id;
  }

  let heroImageUrl: string | null = null;
  if (input.heroImage) {
    try {
      heroImageUrl = await uploadEventHeroImage(input.heroImage);
    } catch (error) {
      if (error instanceof UploadValidationError) {
        throw new EventError(400, error.message);
      }
      throw error;
    }
  }

  const event = await db.$transaction(async (tx) => {
    const created = await tx.event.create({
      data: {
        title: input.title,
        description: input.description,
        type: input.type,
        hostId,
        startsAt,
        endsAt,
        open: input.open,
        icon: input.icon,
        heroImageUrl,
        meetingUrl: input.meetingUrl,
        deidentificationConfirmed: input.deidentificationConfirmed,
      },
      select: { id: true },
    });

    // Auto-created discussion thread (§4.6) — the FK lives on ForumThread,
    // so the Event above is created first and its id is what the thread
    // (and the thread's own linking first post) refers back to.
    if (eventsForumId) {
      const thread = await tx.forumThread.create({
        data: { forumId: eventsForumId, authorId: hostId, title: input.title, eventId: created.id },
        select: { id: true },
      });
      await tx.forumPost.create({
        data: {
          threadId: thread.id,
          authorId: hostId,
          body: `Discussion thread for this event. [View event details](${APP_URL}/calendar/${created.id})`,
        },
      });
    }

    return created;
  });

  return { id: event.id };
}

/**
 * /calendar/[eventId]/edit (§4.6) — full editable field set for the
 * host/admin-gated edit page. Unlike getMemberEventById, meetingUrl and
 * heroImageUrl aren't gated by this viewer's RSVP status: the host editing
 * their own event needs to see (and change) both regardless of whether
 * they've RSVP'd to it. The page itself does the host-or-admin check
 * against the returned hostId before rendering the form.
 */
export async function getEventForEdit(eventId: string) {
  const event = await db.event.findUnique({
    where: { id: eventId },
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
      heroImageUrl: true,
      deidentificationConfirmed: true,
      hostId: true,
    },
  });
  if (!event) return null;

  return {
    id: event.id,
    title: event.title,
    description: event.description,
    type: event.type,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt?.toISOString() ?? null,
    open: event.open,
    icon: event.icon,
    meetingUrl: event.meetingUrl,
    heroImageUrl: getEventHeroImageUrl(event.heroImageUrl),
    deidentificationConfirmed: event.deidentificationConfirmed,
    hostId: event.hostId,
  };
}

/**
 * Edits an existing event (§4.6, `PATCH /api/events/:id`), host or admin
 * only. Doesn't touch the linked discussion thread either way — that's a
 * one-time create-time decision (createEvent above), not something an edit
 * can retroactively add or remove.
 */
export async function updateEvent(
  eventId: string,
  actingUser: UserModel,
  input: {
    title: string;
    description: string | null;
    type: EventType;
    startsAt: string;
    endsAt: string | null;
    open: boolean;
    icon: string | null;
    meetingUrl: string | null;
    deidentificationConfirmed: boolean;
    heroImage: File | null;
  },
): Promise<{ id: string }> {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { id: true, hostId: true, heroImageUrl: true },
  });
  if (!event) throw new EventError(404, "Event not found.");

  const isAdmin = actingUser.role === Role.admin;
  const isHost = event.hostId === actingUser.id;
  if (!isAdmin && !isHost) {
    throw new EventError(403, "Only the event's host or an admin can edit it.");
  }

  const startsAt = new Date(input.startsAt);
  if (Number.isNaN(startsAt.getTime())) {
    throw new EventError(400, "Start date and time isn't valid.");
  }

  let endsAt: Date | null = null;
  if (input.endsAt) {
    endsAt = new Date(input.endsAt);
    if (Number.isNaN(endsAt.getTime())) {
      throw new EventError(400, "End date and time isn't valid.");
    }
    if (endsAt <= startsAt) {
      throw new EventError(400, "End time must be after the start time.");
    }
  }

  if (input.type === EventType.case_discussion && !input.deidentificationConfirmed) {
    throw new EventError(400, "Case Discussion events require the de-identification confirmation.");
  }

  let heroImageUrl = event.heroImageUrl;
  if (input.heroImage) {
    try {
      heroImageUrl = await uploadEventHeroImage(input.heroImage);
    } catch (error) {
      if (error instanceof UploadValidationError) {
        throw new EventError(400, error.message);
      }
      throw error;
    }
  }

  const updated = await db.event.update({
    where: { id: event.id },
    data: {
      title: input.title,
      description: input.description,
      type: input.type,
      startsAt,
      endsAt,
      open: input.open,
      icon: input.icon,
      heroImageUrl,
      meetingUrl: input.meetingUrl,
      deidentificationConfirmed: input.deidentificationConfirmed,
    },
    select: { id: true },
  });

  if (input.heroImage && event.heroImageUrl) {
    await deleteEventHeroImage(event.heroImageUrl);
  }

  return updated;
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
): Promise<{ rsvped: boolean; meetingUrl: string | null; attendeeCount: number }> {
  const event = await db.event.findUnique({ where: { id: eventId }, select: { meetingUrl: true } });
  if (!event) throw new EventError(404, "Event not found.");

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

  const [goingCount, registrationCount] = await Promise.all([
    db.rSVP.count({ where: { eventId, status: RSVPStatus.going } }),
    db.eventRegistration.count({ where: { eventId } }),
  ]);

  const rsvped = nextStatus === RSVPStatus.going;
  return {
    rsvped,
    meetingUrl: rsvped ? event.meetingUrl : null,
    attendeeCount: goingCount + registrationCount,
  };
}

/**
 * Captures a non-member's email/name registering interest in an `open`
 * event from the public /events page — the anonymous counterpart to
 * rsvpToEvent above, but writing to EventRegistration (no userId) instead
 * of RSVP. Upserts on the `(eventId, email)` unique key so a repeat
 * submission from the same visitor is idempotent rather than an error.
 */
export async function registerForEvent(
  eventId: string,
  input: { email: string; name: string },
): Promise<{ id: string; title: string; startsAt: Date }> {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { id: true, title: true, startsAt: true, open: true },
  });
  if (!event) throw new EventError(404, "Event not found.");
  if (!event.open) throw new EventError(400, "This event isn't open for public registration.");

  await db.eventRegistration.upsert({
    where: { eventId_email: { eventId, email: input.email } },
    create: { eventId, email: input.email, name: input.name },
    update: { name: input.name },
  });

  return { id: event.id, title: event.title, startsAt: event.startsAt };
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
 * getMemberEvents — meetingUrl only ever appears in the ICS body for
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
