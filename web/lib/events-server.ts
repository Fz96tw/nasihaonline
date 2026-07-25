import "server-only";
import { db } from "@/lib/db";
import { EventType, EventVisibility, NotificationType, Role, RSVPStatus } from "@/lib/generated/prisma/enums";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { UserModel } from "@/lib/generated/prisma/models/User";
import type {
  DashboardUpcomingEvent,
  EventRegistrationAttendee,
  EventRosterMember,
  EventRsvpAttendee,
  EventWithRsvp,
  MemberEvent,
  MemberHostedEvent,
  PublicEvent,
} from "@/lib/events";
import { EVENTS_FORUM_SLUG } from "@/lib/forums";
import { DIRECTORY_TIERS } from "@/lib/members";
import {
  cancelMeetingCalendarEvent,
  createMeetingCalendarEvent,
  updateMeetingCalendarEventAttendees,
} from "@/lib/google-calendar";
import { createNotification } from "@/lib/notifications-server";
import { sendEventInviteEmail, sendEventLifecycleEmail } from "@/lib/email";
import {
  deleteEventHeroImage,
  getEventHeroImageUrl,
  getProfileAvatarUrl,
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
    where: { startsAt: { gte: new Date() }, visibility: EventVisibility.community, cancelledAt: null },
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

// /events/[eventId] — the public detail page for a signed-out visitor.
// Open to any event, not just `open: true` ones — a members-only event's
// detail page is still visible to a signed-out visitor (title,
// description, host, date), it just can't offer Register (registration is
// only for `open` events); PublicEventDetail branches its CTA on
// event.open to draw that line instead of this query. Same field
// selection as getPublicUpcomingEvents (meetingUrl and
// deidentificationConfirmed are never selected here regardless), no
// startsAt filter so a past event reached via a saved/shared link still
// resolves.
export async function getPublicEventById(eventId: string): Promise<PublicEvent | null> {
  const event = await db.event.findFirst({
    where: { id: eventId, visibility: EventVisibility.community, cancelledAt: null },
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
    heroImageUrl: getEventHeroImageUrl(event.heroImageUrl),
    hostName: event.host.name,
  };
}

// /events for a signed-in viewer (§4.6): same public fields — meetingUrl is
// still never selected here, so a member who hasn't RSVP'd (or RSVP'd but
// is viewing the public listing rather than /calendar) can't see it — plus
// this viewer's own RSVP state, so the "Join to RSVP" CTA can drive an
// actual RSVP toggle for members-only events. userId null (no session)
// always yields rsvped: false.
export async function getEventsForViewer(userId: string | null): Promise<EventWithRsvp[]> {
  const events = await db.event.findMany({
    where: {
      startsAt: { gte: new Date() },
      cancelledAt: null,
      OR: [
        { visibility: EventVisibility.community },
        ...(userId ? [{ hostId: userId }, { invitees: { some: { userId } } }] : []),
      ],
    },
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
    where: {
      cancelledAt: null,
      OR: [{ visibility: EventVisibility.community }, { hostId: userId }, { invitees: { some: { userId } } }],
    },
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
      visibility: true,
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
          views: true,
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
      viewCount: event._count.views,
      visibility: event.visibility,
    };
  });
}

// /calendar/[eventId] — single-event detail view. Not filtered by startsAt
// so a past event reached via an "Add to calendar" link, email reminder, or
// direct navigation still resolves instead of 404ing once its start time
// has passed.
export async function getMemberEventById(userId: string, eventId: string): Promise<MemberEvent | null> {
  const event = await db.event.findFirst({
    where: {
      id: eventId,
      cancelledAt: null,
      OR: [{ visibility: EventVisibility.community }, { hostId: userId }, { invitees: { some: { userId } } }],
    },
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
      visibility: true,
      forumThread: { select: { id: true, _count: { select: { posts: true } } } },
      hostId: true,
      host: { select: { name: true } },
      rsvps: { where: { userId, status: RSVPStatus.going }, select: { id: true } },
      _count: {
        select: {
          rsvps: { where: { status: RSVPStatus.going } },
          registrations: true,
          views: true,
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
    viewCount: event._count.views,
    visibility: event.visibility,
  };
}

/**
 * Full per-person invitee roster for a restricted event's detail page
 * (Objective 02) — every invited member, joined against their RSVP row if
 * any. Caller enforces the access gate (same "caller enforces" convention
 * as getEventAttendees) — the page only calls this for a restricted event
 * it has already confirmed the viewer can see via getMemberEventById.
 */
export async function getEventRoster(eventId: string): Promise<EventRosterMember[]> {
  const invitees = await db.eventInvitee.findMany({
    where: { eventId },
    select: {
      userId: true,
      user: {
        select: {
          name: true,
          profile: { select: { avatarUrl: true } },
          eventRsvps: { where: { eventId }, select: { status: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return invitees.map((invitee) => {
    const rsvpStatus = invitee.user.eventRsvps[0]?.status;
    const status: EventRosterMember["status"] =
      rsvpStatus === RSVPStatus.going ? "going" : rsvpStatus === RSVPStatus.cancelled ? "not_going" : "pending";
    return {
      userId: invitee.userId,
      name: invitee.user.name,
      avatarUrl: getProfileAvatarUrl(invitee.user.profile?.avatarUrl ?? null),
      status,
    };
  });
}

export async function getEventViewCount(eventId: string): Promise<number> {
  return db.eventView.count({ where: { eventId } });
}

/**
 * /members/[memberId]'s Events section (§4.5) — events this member has
 * hosted, newest first. The profile page's viewer is always a signed-in
 * member, so unlike getPublicUpcomingEvents there's no need to filter out
 * members-only events here.
 */
export async function getEventsHostedByMember(hostId: string): Promise<MemberHostedEvent[]> {
  const events = await db.event.findMany({
    where: { hostId },
    select: { id: true, title: true, type: true, startsAt: true, open: true, heroImageUrl: true },
    orderBy: { startsAt: "desc" },
  });
  return events.map((event) => ({
    ...event,
    startsAt: event.startsAt.toISOString(),
    heroImageUrl: getEventHeroImageUrl(event.heroImageUrl),
  }));
}

/**
 * Records a unique visit to an event's detail page for the eye-icon count,
 * called from POST /api/events/:id/view on every page load. Mirrors
 * recordThreadView — /calendar/[eventId] redirects a signed-out visitor to
 * /sign-in before this can ever fire, so `userId` is always a real member
 * and this dedupes on the `[eventId, userId]` unique constraint directly.
 */
export async function recordEventView(eventId: string, userId: string): Promise<number> {
  const event = await db.event.findUnique({ where: { id: eventId }, select: { id: true } });
  if (!event) throw new EventError(404, "Event not found.");

  await db.eventView.createMany({ data: { eventId, userId }, skipDuplicates: true });
  return getEventViewCount(eventId);
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
      cancelledAt: null,
      // A restricted event's organizer/invitees see it unconditionally —
      // they shouldn't have to RSVP to their own private event just to
      // have it surface here. A community event keeps its pre-existing
      // "open OR I've RSVP'd" gate unchanged (the host isn't auto-included
      // for a community event either, same as before this objective).
      OR: [
        { hostId: userId },
        { invitees: { some: { userId } } },
        {
          visibility: EventVisibility.community,
          OR: [{ open: true }, { rsvps: { some: { userId, status: RSVPStatus.going } } }],
        },
      ],
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
    public readonly status: 400 | 403 | 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Bell-notifies newly-invited members with the "please RSVP" copy
 * (Objective 01), reused by both createEvent and updateEventInvitees
 * (Objective 03) rather than duplicated — takes a transaction client so
 * callers can post it alongside the EventInvitee rows in the same
 * transaction.
 */
async function notifyInvitedUsers(
  tx: Prisma.TransactionClient,
  params: { eventId: string; title: string; hostName: string; userIds: string[] },
): Promise<void> {
  if (params.userIds.length === 0) return;
  const link = `/calendar/${params.eventId}`;
  const message = `${params.hostName} has requested your attendance at "${params.title}". Please RSVP.`;
  await tx.notification.createMany({
    data: params.userIds.map((userId) => ({
      recipientId: userId,
      type: NotificationType.event_invited,
      message,
      link,
    })),
  });
}

/**
 * Emails newly-invited members the same "please RSVP" copy, best-effort —
 * reused by createEvent and updateEventInvitees (Objective 03).
 */
async function emailInvitedUsers(
  users: { email: string; name: string | null }[],
  params: { eventId: string; title: string; hostName: string; startsAt: Date },
): Promise<void> {
  if (users.length === 0) return;
  const link = `${APP_URL}/calendar/${params.eventId}`;
  await Promise.allSettled(
    users.map((user) =>
      sendEventInviteEmail(user.email, user.name ?? "there", {
        hostName: params.hostName,
        title: params.title,
        startsAt: params.startsAt,
        link,
      }),
    ),
  );
}

/**
 * Creates an Event from a member's "Submit Event" action (§4.6), gated to
 * EVENT_SUBMISSION_TIERS by the caller. The submitting member always
 * becomes the host — there's no host picker — since `Event.host` is also
 * the auto-earn Knowledge Hours trigger on Attendance (§4.4), and letting a
 * submitter name someone else as host would let them credit that person's
 * hours without their involvement.
 *
 * Audience-Restricted Group Events (Objective 01): when `visibility` is
 * `invited`, `invitedUserIds` becomes the event's EventInvitee list (a
 * community event ignores both `invitedUserIds` and `meetLinkSource`
 * entirely — same manual-only meetingUrl behavior as before this
 * objective). `meetLinkSource: "auto"` calls the same Google Meet
 * integration the 1:1 MeetingRequest flow uses; `"manual"` just stores
 * `input.meetingUrl` as-is, like every event before this objective did.
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
    visibility: EventVisibility;
    invitedUserIds: string[];
    meetLinkSource: "auto" | "manual";
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

  const isRestricted = input.visibility === EventVisibility.invited;

  // Belt-and-suspenders, same rationale as the Case Discussion check above —
  // createEventSchema already blocks this combination, but the Events forum
  // has no audience-restriction concept, so a thread posted there for a
  // restricted event would leak its title (and any discussion) to the
  // whole community regardless of who's invited.
  if (isRestricted && input.createDiscussionThread) {
    throw new EventError(400, "Restricted events can't have a public discussion thread.");
  }

  // Belt-and-suspenders, same rationale as the Case Discussion check above —
  // createEventSchema already requires at least one invitee for a restricted
  // event, but this is the one place no caller can bypass it. Invitees are
  // re-resolved against the same listInDirectory + DIRECTORY_TIERS
  // eligibility that gates mentions/Directory search (§4.5/§4.8/§4.13) —
  // ids that don't match (e.g. a Friend-tier or delisted member) are
  // silently dropped rather than erroring, same "ids that aren't eligible
  // are simply absent" precedent as getDirectoryMembersByIds.
  const invitedUsers = isRestricted
    ? await db.user.findMany({
        where: {
          id: { in: input.invitedUserIds },
          tier: { in: DIRECTORY_TIERS },
          profile: { listInDirectory: true },
        },
        select: { id: true, email: true, name: true },
      })
    : [];
  if (isRestricted && invitedUsers.length === 0) {
    throw new EventError(400, "Select at least one member to invite.");
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

  const host = await db.user.findUnique({ where: { id: hostId }, select: { email: true, name: true } });
  const hostName = host?.name ?? "A member";

  // External network call — kept outside the transaction below, same
  // best-effort philosophy as createMeetingCalendarEvent's own callers
  // (resolveMeetingRequest): a failed/unconfigured Google call must never
  // block event creation, since the Event row is the source of truth.
  let meetingUrl = input.meetingUrl;
  let googleEventId: string | null = null;
  if (isRestricted && input.meetLinkSource === "auto" && host) {
    const attendees = [
      { email: host.email, name: hostName },
      ...invitedUsers.map((user) => ({ email: user.email, name: user.name ?? "Member" })),
    ];
    const created = await createMeetingCalendarEvent({
      topic: input.title,
      startsAt,
      durationMinutes: endsAt ? Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000) : undefined,
      attendees,
      description: input.description ?? undefined,
    });
    meetingUrl = created.meetingUrl;
    googleEventId = created.googleEventId;
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
        meetingUrl,
        googleEventId,
        visibility: input.visibility,
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

    if (invitedUsers.length > 0) {
      await tx.eventInvitee.createMany({
        data: invitedUsers.map((user) => ({ eventId: created.id, userId: user.id })),
      });
      await notifyInvitedUsers(tx, {
        eventId: created.id,
        title: input.title,
        hostName,
        userIds: invitedUsers.map((user) => user.id),
      });
    }

    return created;
  });

  // Best-effort, same rationale as every other email in lib/email.ts — the
  // Event/EventInvitee/Notification rows already exist by this point, so a
  // failed/unconfigured send must not undo the creation.
  await emailInvitedUsers(invitedUsers, { eventId: event.id, title: input.title, hostName, startsAt });

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
    select: { id: true, hostId: true, heroImageUrl: true, startsAt: true, endsAt: true, visibility: true },
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

  // Reschedule notification (Objective 03) — restricted events only,
  // community events keep today's silent-edit behavior unchanged. Compares
  // against the pre-update values fetched above, not the input strings, so
  // e.g. re-submitting the form with the same time never fires this.
  const rescheduled =
    event.visibility === EventVisibility.invited &&
    (event.startsAt.getTime() !== startsAt.getTime() ||
      (event.endsAt?.getTime() ?? null) !== (endsAt?.getTime() ?? null));
  if (rescheduled) {
    const invitees = await db.eventInvitee.findMany({
      where: { eventId },
      select: { userId: true, user: { select: { email: true, name: true } } },
    });
    if (invitees.length > 0) {
      const link = `/calendar/${eventId}`;
      const when = startsAt.toLocaleString("en-US", { dateStyle: "full", timeStyle: "short" });
      const message = `"${input.title}" has been rescheduled to ${when}.`;
      await db.notification.createMany({
        data: invitees.map((invitee) => ({
          recipientId: invitee.userId,
          type: NotificationType.event_rescheduled,
          message,
          link,
        })),
      });
      await Promise.allSettled(
        invitees.map((invitee) =>
          sendEventLifecycleEmail(invitee.user.email, invitee.user.name ?? "there", {
            subject: `Rescheduled: ${input.title}`,
            message,
            link: `${APP_URL}${link}`,
          }),
        ),
      );
    }
  }

  return updated;
}

/**
 * Adds and/or removes members from a restricted event's invited list after
 * creation (Audience-Restricted Group Events, Objective 03) — host or
 * admin only. Newly added invitees get the exact same invite
 * notification+email objective 01 sends at creation (via the shared
 * notifyInvitedUsers/emailInvitedUsers helpers, not duplicated); removed
 * invitees get a "no longer needed" notification+email, lose their RSVP
 * row, and — if the Meet link was auto-generated — are dropped from the
 * underlying Google Calendar event's attendee list.
 */
export async function updateEventInvitees(
  eventId: string,
  actingUser: UserModel,
  input: { addUserIds: string[]; removeUserIds: string[] },
): Promise<{ added: number; removed: number }> {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: {
      title: true,
      hostId: true,
      visibility: true,
      googleEventId: true,
      cancelledAt: true,
      startsAt: true,
    },
  });
  if (!event) throw new EventError(404, "Event not found.");
  if (event.cancelledAt) throw new EventError(409, "This event has been cancelled.");
  if (event.visibility !== EventVisibility.invited) {
    throw new EventError(400, "Only restricted events have an invited list.");
  }

  const isAdmin = actingUser.role === Role.admin;
  const isHost = actingUser.id === event.hostId;
  if (!isAdmin && !isHost) {
    throw new EventError(403, "Only the event's host or an admin can manage invitees.");
  }

  const host = await db.user.findUnique({ where: { id: event.hostId }, select: { email: true, name: true } });
  const hostName = host?.name ?? "A member";

  // Re-resolved against directory eligibility, same rationale as
  // createEvent — ids that aren't eligible (or already invited, or the
  // host) are silently dropped rather than erroring.
  const [addCandidates, alreadyInvited, removeCandidates] = await Promise.all([
    input.addUserIds.length > 0
      ? db.user.findMany({
          where: {
            id: { in: input.addUserIds, notIn: [event.hostId] },
            tier: { in: DIRECTORY_TIERS },
            profile: { listInDirectory: true },
          },
          select: { id: true, email: true, name: true },
        })
      : Promise.resolve([]),
    input.addUserIds.length > 0
      ? db.eventInvitee.findMany({ where: { eventId, userId: { in: input.addUserIds } }, select: { userId: true } })
      : Promise.resolve([]),
    input.removeUserIds.length > 0
      ? db.eventInvitee.findMany({
          where: { eventId, userId: { in: input.removeUserIds } },
          select: { userId: true, user: { select: { email: true, name: true } } },
        })
      : Promise.resolve([]),
  ]);
  const alreadyInvitedIds = new Set(alreadyInvited.map((row) => row.userId));
  const newInvitees = addCandidates.filter((user) => !alreadyInvitedIds.has(user.id));

  await db.$transaction(async (tx) => {
    if (newInvitees.length > 0) {
      await tx.eventInvitee.createMany({
        data: newInvitees.map((user) => ({ eventId, userId: user.id })),
      });
      await notifyInvitedUsers(tx, {
        eventId,
        title: event.title,
        hostName,
        userIds: newInvitees.map((user) => user.id),
      });
    }

    if (removeCandidates.length > 0) {
      const removeIds = removeCandidates.map((row) => row.userId);
      await tx.eventInvitee.deleteMany({ where: { eventId, userId: { in: removeIds } } });
      await tx.rSVP.deleteMany({ where: { eventId, userId: { in: removeIds } } });

      const link = `/calendar/${eventId}`;
      const message = `You are no longer needed for "${event.title}".`;
      await tx.notification.createMany({
        data: removeIds.map((userId) => ({
          recipientId: userId,
          type: NotificationType.event_removed,
          message,
          link,
        })),
      });
    }
  });

  // Best-effort, same rationale as every other email/Google call in this
  // file — the DB rows already reflect the new invited list by this point.
  await Promise.all([
    emailInvitedUsers(newInvitees, { eventId, title: event.title, hostName, startsAt: event.startsAt }),
    removeCandidates.length > 0
      ? Promise.allSettled(
          removeCandidates.map((row) =>
            sendEventLifecycleEmail(row.user.email, row.user.name ?? "there", {
              subject: `Update: ${event.title}`,
              message: `You are no longer needed for "${event.title}".`,
              link: `${APP_URL}/calendar/${eventId}`,
            }),
          ),
        )
      : Promise.resolve(),
  ]);

  if (event.googleEventId && (newInvitees.length > 0 || removeCandidates.length > 0)) {
    const currentInvitees = await db.eventInvitee.findMany({
      where: { eventId },
      select: { user: { select: { email: true, name: true } } },
    });
    const attendees = [
      ...(host ? [{ email: host.email, name: hostName }] : []),
      ...currentInvitees.map((invitee) => ({ email: invitee.user.email, name: invitee.user.name ?? "Member" })),
    ];
    await updateMeetingCalendarEventAttendees(event.googleEventId, attendees);
  }

  return { added: newInvitees.length, removed: removeCandidates.length };
}

/**
 * Cancels an event (host or admin only) — a one-way, soft-delete-style flag
 * (Event.cancelledAt), not a status a host can clear. For a restricted
 * event, notifies every current invitee (bell + email) and, if the Meet
 * link was auto-generated, deletes the underlying Google Calendar event.
 * Community events can be cancelled too (the field/query filtering is
 * generic) but this objective's UI only exposes the action for restricted
 * events — see components/calendar/manage-invitees.tsx.
 */
export async function cancelEvent(eventId: string, actingUser: UserModel): Promise<void> {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { title: true, hostId: true, visibility: true, googleEventId: true, cancelledAt: true },
  });
  if (!event) throw new EventError(404, "Event not found.");
  if (event.cancelledAt) throw new EventError(409, "This event has already been cancelled.");

  const isAdmin = actingUser.role === Role.admin;
  const isHost = actingUser.id === event.hostId;
  if (!isAdmin && !isHost) {
    throw new EventError(403, "Only the event's host or an admin can cancel it.");
  }

  const isRestricted = event.visibility === EventVisibility.invited;
  const invitees = isRestricted
    ? await db.eventInvitee.findMany({
        where: { eventId },
        select: { userId: true, user: { select: { email: true, name: true } } },
      })
    : [];

  await db.event.update({ where: { id: eventId }, data: { cancelledAt: new Date() } });

  if (isRestricted && invitees.length > 0) {
    const link = `/calendar/${eventId}`;
    const message = `${actingUser.name ?? "The host"} cancelled "${event.title}".`;
    await db.notification.createMany({
      data: invitees.map((invitee) => ({
        recipientId: invitee.userId,
        type: NotificationType.event_cancelled,
        message,
        link,
      })),
    });
    await Promise.allSettled(
      invitees.map((invitee) =>
        sendEventLifecycleEmail(invitee.user.email, invitee.user.name ?? "there", {
          subject: `Cancelled: ${event.title}`,
          message,
          link: `${APP_URL}${link}`,
        }),
      ),
    );
  }

  if (event.googleEventId) {
    await cancelMeetingCalendarEvent(event.googleEventId);
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
  actingUser: UserModel,
  eventId: string,
): Promise<{ rsvped: boolean; meetingUrl: string | null; attendeeCount: number }> {
  const userId = actingUser.id;
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { title: true, meetingUrl: true, hostId: true, visibility: true },
  });
  if (!event) throw new EventError(404, "Event not found.");

  // RSVPing on a restricted event is gated to the organizer, an admin, or
  // an invited member (Objective 02) — a member who isn't invited can't
  // even see the event per Objective 01's visibility filtering, but this
  // is the belt-and-suspenders enforcement point for the RSVP action
  // itself, same "no caller can bypass it" rationale as the Case
  // Discussion check in createEvent.
  const isRestricted = event.visibility === EventVisibility.invited;
  if (isRestricted && userId !== event.hostId && actingUser.role !== Role.admin) {
    const invited = await db.eventInvitee.findUnique({ where: { eventId_userId: { eventId, userId } } });
    if (!invited) throw new EventError(403, "You're not invited to this event.");
  }

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

  // Bell-only host notification (Objective 02) — restricted events only;
  // skipped when the host RSVPs to their own event (nothing to tell them).
  if (isRestricted && userId !== event.hostId) {
    const responseLabel = nextStatus === RSVPStatus.going ? "going" : "not going";
    await createNotification({
      recipientId: event.hostId,
      type: NotificationType.event_rsvp_response,
      message: `${actingUser.name ?? "A member"} RSVP'd ${responseLabel} to "${event.title}".`,
      link: `/calendar/${eventId}`,
    });
  }

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
