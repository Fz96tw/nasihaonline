import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import {
  EventType,
  EventVisibility,
  NotificationType,
  RecordingOrigin,
  RecurrenceFrequency,
  Role,
  RSVPStatus,
} from "@/lib/generated/prisma/enums";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { UserModel } from "@/lib/generated/prisma/models/User";
import type {
  DashboardUpcomingEvent,
  EventNotificationBroadcastItem,
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
  createLiveKitMeetingCalendarEvent,
  createMeetingCalendarEvent,
  deleteMeetingRecording,
  getMeetingRecordingDownloadUrl,
  updateMeetingCalendarEventAttendees,
  updateMeetingCalendarEventRecurrence,
  updateMeetingCalendarEventTime,
} from "@/lib/google-calendar";
import { createLiveKitRoom } from "@/lib/livekit";
import { createNotification } from "@/lib/notifications-server";
import {
  sendEventAnnouncementEmail,
  sendEventInviteEmail,
  sendEventLifecycleEmail,
  sendEventRegistrationReminderEmail,
  sendRsvpConfirmationEmail,
} from "@/lib/email";
import { formatEventDateTime, formatEventTime } from "@/lib/format-date";
import { createForumPost } from "@/lib/forums-server";
import { enqueueForumThreadIndexSync } from "@/lib/queues/search-index-queue";
import { buildRRule, buildRRuleString, describeRecurrence, expandOccurrences, type RecurrenceInput } from "@/lib/recurrence";
import {
  deleteEventHeroImage,
  deleteMeetingMessageImage,
  getEventHeroImageUrl,
  getMeetingMessageImageUrl,
  getProfileAvatarUrl,
  RESTRICTED_EVENT_DEFAULT_HERO_KEY,
  uploadEventHeroImage,
  uploadMeetingMessageImage,
  UploadValidationError,
} from "@/lib/storage";

// Absolute, not relative — a discussion thread's first post
// (startEventDiscussion, below) needs a real URL for lib/linkify.tsx's
// linkifyText to turn into a clickable link; it only matches absolute
// http(s) URLs.
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";

// ===== Recurring events (§4.6) — shared expansion helpers =====

const RECURRENCE_SELECT = { frequency: true, interval: true, byWeekday: true, until: true } as const;

type RecurrenceRow = {
  frequency: RecurrenceFrequency;
  interval: number;
  byWeekday: number[];
  until: Date | null;
};

function toRecurrenceInput(recurrence: RecurrenceRow): RecurrenceInput {
  return {
    frequency: recurrence.frequency,
    interval: recurrence.interval,
    byWeekday: recurrence.byWeekday,
    until: recurrence.until,
  };
}

function recurrenceInputsEqual(a: RecurrenceInput | null, b: RecurrenceInput | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  const aWeekdays = [...a.byWeekday].sort((x, y) => x - y);
  const bWeekdays = [...b.byWeekday].sort((x, y) => x - y);
  return (
    a.frequency === b.frequency &&
    a.interval === b.interval &&
    (a.until?.getTime() ?? null) === (b.until?.getTime() ?? null) &&
    aWeekdays.length === bWeekdays.length &&
    aWeekdays.every((day, index) => day === bWeekdays[index])
  );
}

/**
 * Derives which meetLinkSource an already-created event is currently using
 * — there's no stored `meetLinkSource` column (only create-time input), so
 * this is inferred from which of the three underlying fields is populated.
 * Checked in this order since a livekit-backed event also carries a
 * googleEventId (the plain, non-Meet calendar entry
 * createLiveKitMeetingCalendarEvent creates alongside the room), so
 * googleEventId alone can't distinguish "auto" from "livekit". Shared by
 * getEventForEdit (to default the edit form's selector correctly) and
 * updateEvent (Meeting Platform Switching, to detect an actual change).
 */
function deriveMeetLinkSource(event: {
  meetingUrl: string | null;
  googleEventId: string | null;
  livekitRoomName: string | null;
}): "auto" | "manual" | "livekit" | "none" {
  if (event.livekitRoomName) return "livekit";
  if (event.googleEventId) return "auto";
  if (event.meetingUrl) return "manual";
  return "none";
}

/**
 * Turns one Event row into one or more listing rows: a non-recurring event
 * passes through unchanged (1:1, same as before recurring events existed);
 * a recurring event's EventRecurrence rule is expanded into every
 * occurrence within [rangeStart, rangeEnd], each becoming its own row with
 * a synthetic occurrenceId. Occurrences aren't materialized as separate
 * Event rows in the database — see EventRecurrence's schema comment — so
 * every read path that lists events must call this rather than mapping
 * rows 1:1.
 */
function expandEventForListing<
  T extends { id: string; startsAt: Date; endsAt: Date | null; recurrence: RecurrenceRow | null },
>(
  event: T,
  rangeStart: Date,
  rangeEnd: Date,
): Array<T & { occurrenceStart: Date; occurrenceEnd: Date | null; occurrenceId: string; isRecurring: boolean }> {
  if (!event.recurrence) {
    return [
      { ...event, occurrenceStart: event.startsAt, occurrenceEnd: event.endsAt, occurrenceId: event.id, isRecurring: false },
    ];
  }
  const occurrences = expandOccurrences(event, toRecurrenceInput(event.recurrence), rangeStart, rangeEnd, {
    limit: 200,
  });
  return occurrences.map((occurrence) => ({
    ...event,
    occurrenceStart: occurrence.occurrenceStart,
    occurrenceEnd: occurrence.occurrenceEnd,
    occurrenceId: occurrence.occurrenceId,
    isRecurring: true,
  }));
}

const MONTH_MS = 1000 * 60 * 60 * 24 * 30;

/**
 * A recurring master's own `startsAt` can be long in the past for a
 * still-ongoing series (e.g. a weekly halaqa that started a year ago) — the
 * plain `startsAt: { gte: now }` filter every listing query used before
 * recurring events existed would wrongly exclude it. OR'd alongside that
 * filter (via AND with the rest of a query's where clause) so a recurring
 * master with a past startsAt but a still-active (or unbounded) `until` is
 * still fetched; expandEventForListing does the real per-occurrence date
 * filtering afterward.
 */
function recurringSeriesStillActiveOrUpcoming(now: Date): Prisma.EventWhereInput {
  return {
    OR: [
      { startsAt: { gte: now } },
      {
        recurrence: { isNot: null },
        OR: [{ recurrence: { until: null } }, { recurrence: { until: { gte: now } } }],
      },
    ],
  };
}

// The server-side enforcement point for public event visibility (§4.6):
// meetingUrl and deidentificationConfirmed are never selected here, so no
// caller of this function — page or API route — can leak them to an
// unauthenticated visitor by accident. Member-only fields (RSVP state, the
// gated meeting link) are added by a later objective's own query, not this
// one.
export async function getPublicUpcomingEvents(): Promise<PublicEvent[]> {
  const now = new Date();
  const rangeEnd = new Date(now.getTime() + 6 * MONTH_MS);
  const events = await db.event.findMany({
    where: { visibility: EventVisibility.community, cancelledAt: null, ...recurringSeriesStillActiveOrUpcoming(now) },
    select: {
      id: true,
      title: true,
      description: true,
      type: true,
      startsAt: true,
      endsAt: true,
      open: true,
      heroImageUrl: true,
      host: { select: { name: true } },
      recurrence: { select: RECURRENCE_SELECT },
    },
    orderBy: { startsAt: "asc" },
  });

  return events
    .flatMap((event) => expandEventForListing(event, now, rangeEnd))
    .sort((a, b) => a.occurrenceStart.getTime() - b.occurrenceStart.getTime())
    .map((event) => ({
      id: event.occurrenceId,
      title: event.title,
      description: event.description,
      type: event.type,
      startsAt: event.occurrenceStart.toISOString(),
      endsAt: event.occurrenceEnd?.toISOString() ?? null,
      open: event.open,
      heroImageUrl: getEventHeroImageUrl(event.heroImageUrl),
      hostName: event.host.name,
      seriesId: event.id,
      isRecurring: event.isRecurring,
      recurrenceSummary: event.recurrence ? describeRecurrence(toRecurrenceInput(event.recurrence)) : null,
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
      heroImageUrl: true,
      host: { select: { name: true } },
      recurrence: { select: RECURRENCE_SELECT },
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
    heroImageUrl: getEventHeroImageUrl(event.heroImageUrl),
    hostName: event.host.name,
    seriesId: event.id,
    isRecurring: event.recurrence !== null,
    recurrenceSummary: event.recurrence ? describeRecurrence(toRecurrenceInput(event.recurrence)) : null,
  };
}

// /events for a signed-in viewer (§4.6): same public fields — meetingUrl is
// still never selected here, so a member who hasn't RSVP'd (or RSVP'd but
// is viewing the public listing rather than /calendar) can't see it — plus
// this viewer's own RSVP state, so the "Join to RSVP" CTA can drive an
// actual RSVP toggle for members-only events. userId null (no session)
// always yields rsvped: false.
export async function getEventsForViewer(userId: string | null): Promise<EventWithRsvp[]> {
  const now = new Date();
  const rangeEnd = new Date(now.getTime() + 6 * MONTH_MS);
  const events = await db.event.findMany({
    where: {
      cancelledAt: null,
      AND: [
        {
          OR: [
            { visibility: EventVisibility.community },
            ...(userId ? [{ hostId: userId }, { invitees: { some: { userId } } }] : []),
          ],
        },
        recurringSeriesStillActiveOrUpcoming(now),
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
      heroImageUrl: true,
      visibility: true,
      host: { select: { name: true } },
      rsvps: userId ? { where: { userId, status: RSVPStatus.going }, select: { id: true } } : false,
      recurrence: { select: RECURRENCE_SELECT },
    },
    orderBy: { startsAt: "asc" },
  });

  return events
    .flatMap((event) => expandEventForListing(event, now, rangeEnd))
    .sort((a, b) => a.occurrenceStart.getTime() - b.occurrenceStart.getTime())
    .map((event) => ({
      id: event.occurrenceId,
      title: event.title,
      description: event.description,
      type: event.type,
      startsAt: event.occurrenceStart.toISOString(),
      endsAt: event.occurrenceEnd?.toISOString() ?? null,
      open: event.open,
      heroImageUrl: getEventHeroImageUrl(event.heroImageUrl),
      hostName: event.host.name,
      rsvped: userId ? event.rsvps.length > 0 : false,
      visibility: event.visibility,
      seriesId: event.id,
      isRecurring: event.isRecurring,
      recurrenceSummary: event.recurrence ? describeRecurrence(toRecurrenceInput(event.recurrence)) : null,
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
  // Recurring events have no month-cursor param to bound expansion by the
  // month actually being browsed (FullCalendar fetches this whole dataset
  // once) — a fixed 6-months-back/6-months-forward window is a generous
  // middle ground: a member browsing further than that in either direction
  // simply won't see recurring occurrences there, an accepted v1 gap.
  // One-off events keep passing through unfiltered, exactly as before.
  const now = new Date();
  const rangeStart = new Date(now.getTime() - 6 * MONTH_MS);
  const rangeEnd = new Date(now.getTime() + 6 * MONTH_MS);
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
      heroImageUrl: true,
      meetingUrl: true,
      livekitRoomName: true,
      visibility: true,
      forumThread: { select: { id: true, _count: { select: { posts: true } } } },
      hostId: true,
      host: { select: { name: true } },
      rsvps: { where: { userId, status: RSVPStatus.going }, select: { id: true } },
      recurrence: { select: RECURRENCE_SELECT },
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

  return events
    .flatMap((event) => expandEventForListing(event, rangeStart, rangeEnd))
    .sort((a, b) => a.occurrenceStart.getTime() - b.occurrenceStart.getTime())
    .map((event) => {
      const rsvped = event.rsvps.length > 0;
      return {
        id: event.occurrenceId,
        title: event.title,
        description: event.description,
        type: event.type,
        startsAt: event.occurrenceStart.toISOString(),
        endsAt: event.occurrenceEnd?.toISOString() ?? null,
        open: event.open,
        heroImageUrl: getEventHeroImageUrl(event.heroImageUrl),
        hostId: event.hostId,
        hostName: event.host.name,
        rsvped,
        // This listing query filters cancelledAt: null above, so every result here is live.
        cancelled: false,
        // The host can always join their own meeting — they never auto-RSVP
        // to their own event, so gating this on `rsvped` alone would hide it
        // from the one person who definitely needs it.
        meetingUrl: rsvped || event.hostId === userId ? event.meetingUrl : null,
        livekitRoomName: rsvped || event.hostId === userId ? event.livekitRoomName : null,
        // Not surfaced on the list view, only the single-event detail page
        // (getMemberEventById below) — a recording is a post-meeting artifact
        // a member would look for on the event itself, not while browsing.
        recordingUrl: null,
        liveKitRecordingSegments: [],
        chatTranscriptPostId: null,
        meetingEndedAt: null,
        attendeeCount: event._count.rsvps + event._count.registrations,
        forumThreadId: event.forumThread?.id ?? null,
        forumReplyCount: event.forumThread ? event.forumThread._count.posts - 1 : null,
        viewCount: event._count.views,
        visibility: event.visibility,
        seriesId: event.id,
        isRecurring: event.isRecurring,
        recurrenceSummary: event.recurrence ? describeRecurrence(toRecurrenceInput(event.recurrence)) : null,
      };
    });
}

// /calendar/[eventId] — single-event detail view. Not filtered by startsAt
// so a past event reached via an "Add to calendar" link, email reminder, or
// direct navigation still resolves instead of 404ing once its start time
// has passed. Also deliberately not filtered on cancelledAt (unlike
// getMemberEvents' listing query) — a cancellation notification links
// straight here, and the invitee who just got notified needs the page to
// resolve with a "this event was cancelled" state rather than 404. The page
// is responsible for rendering that state off the returned `cancelled` flag.
export async function getMemberEventById(
  userId: string,
  eventId: string,
  occurrenceStartIso?: string,
): Promise<MemberEvent | null> {
  const event = await db.event.findFirst({
    where: {
      id: eventId,
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
      heroImageUrl: true,
      meetingUrl: true,
      livekitRoomName: true,
      meetingEndedAt: true,
      visibility: true,
      cancelledAt: true,
      forumThread: { select: { id: true, _count: { select: { posts: true } } } },
      hostId: true,
      host: { select: { name: true } },
      rsvps: { where: { userId, status: RSVPStatus.going }, select: { id: true } },
      recurrence: { select: RECURRENCE_SELECT },
      recordings: {
        select: {
          occurrenceDate: true,
          recordingUrl: true,
          origin: true,
          id: true,
          startedAt: true,
          objectKey: true,
          failedAt: true,
          durationSeconds: true,
        },
      },
      chatTranscripts: {
        select: { occurrenceDate: true, forumPostId: true, createdAt: true },
      },
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

  // Resolve which occurrence this detail view is for. A bare
  // /calendar/[eventId] link (e.g. from a notification) has no
  // ?occurrence= — falls back to the series' next upcoming occurrence, or
  // its most recent past one if the series has already ended.
  let occurrenceStart = event.startsAt;
  let occurrenceEnd = event.endsAt;
  if (event.recurrence) {
    const recurrenceInput = toRecurrenceInput(event.recurrence);
    const requested = occurrenceStartIso ? new Date(occurrenceStartIso) : null;
    const durationMs = event.endsAt ? event.endsAt.getTime() - event.startsAt.getTime() : null;
    let resolved: Date | null = requested && !Number.isNaN(requested.getTime()) ? requested : null;
    if (!resolved) {
      const rule = buildRRule(recurrenceInput, event.startsAt);
      resolved = rule.after(new Date(), true) ?? rule.before(new Date(), true) ?? event.startsAt;
    }
    occurrenceStart = resolved;
    occurrenceEnd = durationMs !== null ? new Date(resolved.getTime() + durationMs) : null;
  }

  const occurrenceRecordings = event.recordings.filter(
    (recording) => recording.occurrenceDate.getTime() === occurrenceStart.getTime(),
  );
  const recordingForOccurrence = occurrenceRecordings.find((recording) => recording.origin === RecordingOrigin.meet);
  const liveKitSegments = occurrenceRecordings
    .filter((recording) => recording.origin === RecordingOrigin.livekit && recording.startedAt)
    .sort((a, b) => a.startedAt!.getTime() - b.startedAt!.getTime());
  const chatTranscriptForOccurrence = event.chatTranscripts
    .filter((transcript) => transcript.occurrenceDate.getTime() === occurrenceStart.getTime())
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

  const rsvped = event.rsvps.length > 0;
  return {
    id: event.recurrence ? `${event.id}::${occurrenceStart.toISOString()}` : event.id,
    title: event.title,
    description: event.description,
    type: event.type,
    startsAt: occurrenceStart.toISOString(),
    endsAt: occurrenceEnd?.toISOString() ?? null,
    open: event.open,
    heroImageUrl: getEventHeroImageUrl(event.heroImageUrl),
    hostId: event.hostId,
    hostName: event.host.name,
    rsvped,
    cancelled: event.cancelledAt !== null,
    // Same host exception as getMemberEvents above.
    meetingUrl: rsvped || event.hostId === userId ? event.meetingUrl : null,
    livekitRoomName: rsvped || event.hostId === userId ? event.livekitRoomName : null,
    meetingEndedAt: (rsvped || event.hostId === userId) ? (event.meetingEndedAt?.toISOString() ?? null) : null,
    recordingUrl: (rsvped || event.hostId === userId) ? (recordingForOccurrence?.recordingUrl ?? null) : null,
    liveKitRecordingSegments:
      rsvped || event.hostId === userId
        ? liveKitSegments.map((s) => ({
            id: s.id,
            startedAt: s.startedAt!.toISOString(),
            ready: s.objectKey !== null,
            failed: s.failedAt !== null,
            durationSeconds: s.durationSeconds,
          }))
        : [],
    chatTranscriptPostId: (rsvped || event.hostId === userId) ? (chatTranscriptForOccurrence?.forumPostId ?? null) : null,
    attendeeCount: event._count.rsvps + event._count.registrations,
    forumThreadId: event.forumThread?.id ?? null,
    forumReplyCount: event.forumThread ? event.forumThread._count.posts - 1 : null,
    viewCount: event._count.views,
    visibility: event.visibility,
    seriesId: event.id,
    isRecurring: event.recurrence !== null,
    recurrenceSummary: event.recurrence ? describeRecurrence(toRecurrenceInput(event.recurrence)) : null,
  };
}

/**
 * On-demand "Start a Discussion" (mirrors startKnowledgeItemDiscussion,
 * §4.9) for an existing event that wasn't given one at submission time —
 * the "create a discussion thread" checkbox on Submit Event is opt-in and
 * create-only, so an event whose host skipped it (or that predates this
 * button existing at all) would otherwise never get one. Idempotent: a
 * late click after someone else already started it resolves to the same
 * thread rather than erroring. Same visibility gate as getMemberEventById
 * (community, or the host, or an invitee) enforced here directly rather
 * than left to the caller, since — unlike getEventRoster above — this is
 * reachable from a POST API route a non-invitee could hit with a guessed
 * eventId even if the page itself never renders the button for them; 404s
 * rather than 403s for the same reason getForumThreadDetail does.
 */
export async function startEventDiscussion(eventId: string, starterId: string): Promise<{ threadId: string }> {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      title: true,
      visibility: true,
      hostId: true,
      cancelledAt: true,
      forumThread: { select: { id: true } },
      invitees: { select: { userId: true } },
    },
  });
  if (!event) throw new EventError(404, "Event not found.");

  const canView =
    event.visibility === EventVisibility.community ||
    event.hostId === starterId ||
    event.invitees.some((invitee) => invitee.userId === starterId);
  if (!canView) throw new EventError(404, "Event not found.");

  if (event.cancelledAt) throw new EventError(400, "This event has been cancelled.");
  if (event.forumThread) return { threadId: event.forumThread.id };

  const forum = await db.forum.findUnique({ where: { slug: EVENTS_FORUM_SLUG }, select: { id: true } });
  if (!forum) {
    throw new EventError(400, "The Events discussion forum isn't set up yet — contact an admin.");
  }

  const thread = await db.$transaction(async (tx) => {
    const created = await tx.forumThread.create({
      data: { forumId: forum.id, authorId: starterId, title: event.title, eventId: event.id },
      select: { id: true },
    });
    await tx.forumPost.create({
      data: {
        threadId: created.id,
        authorId: starterId,
        body: `Discussion thread for this event. [View event details](${APP_URL}/calendar/${event.id})`,
      },
    });
    return created;
  });

  return { threadId: thread.id };
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

const TRENDING_WINDOW_DAYS = 30;

/**
 * Dashboard "What's Trending" — events with the most views in the last 30
 * days. Gated the same way as getDashboardUpcomingEvents: a `community`
 * event is visible to everyone, an `invited` event only to its host/
 * invitees, and isPrivileged (admin/moderator) bypasses the gate entirely.
 * Over-fetches the view-count grouping since this filter can now drop
 * results that a viewer isn't allowed to see.
 */
export async function getTrendingEvents(
  userId: string,
  isPrivileged: boolean,
  limit = 3,
): Promise<{ id: string; title: string; viewCount: number }[]> {
  const since = new Date(Date.now() - TRENDING_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const grouped = await db.eventView.groupBy({
    by: ["eventId"],
    where: { createdAt: { gte: since } },
    _count: { eventId: true },
    orderBy: { _count: { eventId: "desc" } },
    take: limit * 3,
  });
  if (grouped.length === 0) return [];

  const events = await db.event.findMany({
    where: {
      id: { in: grouped.map((group) => group.eventId) },
      cancelledAt: null,
      ...(isPrivileged
        ? {}
        : {
            OR: [
              { hostId: userId },
              { invitees: { some: { userId } } },
              { visibility: EventVisibility.community },
            ],
          }),
    },
    select: { id: true, title: true },
  });
  const byId = new Map(events.map((event) => [event.id, event]));

  return grouped
    .flatMap((group) => {
      const event = byId.get(group.eventId);
      return event ? [{ id: event.id, title: event.title, viewCount: group._count.eventId }] : [];
    })
    .slice(0, limit);
}

/**
 * /members/[memberId]'s Events section (§4.5) — events this member has
 * hosted, newest first. The profile page's viewer is always a signed-in
 * member, so unlike getPublicUpcomingEvents there's no need to filter out
 * members-only events here — but a restricted (`invited`-visibility) event
 * still needs the same viewer-aware OR filter getEventsForViewer/
 * getMemberEventById apply, so an uninvited profile visitor can't discover
 * a restricted event's existence, title, or hero image just by browsing its
 * host's profile. Host viewing their own profile always sees their own
 * restricted events (`{ hostId: viewerId }` below); no admin/Steward
 * bypass, matching every other events read path's convention — an admin
 * discovers a restricted event only if they're independently the host or
 * invited, same as any other member.
 */
export async function getEventsHostedByMember(hostId: string, viewerId: string): Promise<MemberHostedEvent[]> {
  const events = await db.event.findMany({
    where: {
      hostId,
      OR: [
        { visibility: EventVisibility.community },
        { hostId: viewerId },
        { invitees: { some: { userId: viewerId } } },
      ],
    },
    select: {
      id: true,
      title: true,
      type: true,
      startsAt: true,
      open: true,
      heroImageUrl: true,
      cancelledAt: true,
      createdAt: true,
    },
    orderBy: { startsAt: "desc" },
  });
  return events.map((event) => ({
    ...event,
    startsAt: event.startsAt.toISOString(),
    heroImageUrl: getEventHeroImageUrl(event.heroImageUrl),
    cancelledAt: event.cancelledAt?.toISOString() ?? null,
    createdAt: event.createdAt.toISOString(),
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
  // Start-of-day cutoff, not `now` — a today event shouldn't drop off the
  // dashboard the moment its start time passes.
  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);
  // Dashboard widget only ever needs a handful of soonest items — 3 months
  // is generous headroom for `limit` to have candidates even if the next
  // few weeks are sparse.
  const rangeEnd = new Date(startOfToday.getTime() + 3 * MONTH_MS);

  const events = await db.event.findMany({
    where: {
      cancelledAt: null,
      AND: [
        // A restricted event's organizer/invitees see it unconditionally —
        // they shouldn't have to RSVP to their own private event just to
        // have it surface here. A community event keeps its pre-existing
        // "open OR I've RSVP'd" gate unchanged (the host isn't auto-included
        // for a community event either, same as before this objective).
        {
          OR: [
            { hostId: userId },
            { invitees: { some: { userId } } },
            {
              visibility: EventVisibility.community,
              OR: [{ open: true }, { rsvps: { some: { userId, status: RSVPStatus.going } } }],
            },
          ],
        },
        recurringSeriesStillActiveOrUpcoming(startOfToday),
      ],
    },
    select: {
      id: true,
      title: true,
      type: true,
      startsAt: true,
      endsAt: true,
      hostId: true,
      meetingUrl: true,
      livekitRoomName: true,
      rsvps: { where: { userId, status: RSVPStatus.going }, select: { id: true } },
      recurrence: { select: RECURRENCE_SELECT },
    },
    orderBy: { startsAt: "asc" },
  });

  return events
    .flatMap((event) => expandEventForListing(event, startOfToday, rangeEnd))
    .sort((a, b) => a.occurrenceStart.getTime() - b.occurrenceStart.getTime())
    .slice(0, limit)
    .map((event) => {
      const rsvped = event.rsvps.length > 0;
      // A same-day event stays on the dashboard past its start time (see the
      // start-of-day cutoff above), but its join link shouldn't — once this
      // occurrence has actually ended there's nothing left to join.
      const occurrenceIsPast = (event.occurrenceEnd ?? event.occurrenceStart) < new Date();
      const canJoin = !occurrenceIsPast && (rsvped || event.hostId === userId);
      return {
        id: event.occurrenceId,
        title: event.title,
        type: event.type,
        startsAt: event.occurrenceStart.toISOString(),
        rsvped,
        // Same gate as getMemberEvents: the host can always join their own
        // meeting even though they never auto-RSVP to their own event.
        meetingUrl: canJoin ? event.meetingUrl : null,
        livekitRoomName: canJoin ? event.livekitRoomName : null,
        seriesId: event.id,
        isRecurring: event.isRecurring,
      };
    });
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
    public readonly status: 400 | 403 | 404 | 409 | 502,
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
  params: { eventId: string; title: string; hostName: string; startsAt: Date; timezone: string | null },
): Promise<void> {
  if (users.length === 0) return;
  const link = `${APP_URL}/calendar/${params.eventId}`;
  await Promise.allSettled(
    users.map((user) =>
      sendEventInviteEmail(user.email, user.name ?? "there", {
        hostName: params.hostName,
        title: params.title,
        startsAt: params.startsAt,
        timezone: params.timezone,
        link,
      }),
    ),
  );
}

/**
 * Bell-notifies this event's audience — every member for a community event
 * (mirroring announcements-server.ts's board_announcement broadcast, scoped
 * to one event), or just the current EventInvitee list for a restricted one
 * — and logs the send as an EventNotificationBroadcast row, the durable
 * trail the "Resend Notifications" section on the event detail page reads
 * back (getEventNotificationBroadcasts) regardless of which audience it
 * went to. Shared by createEvent's automatic community-event send and
 * resendEventNotifications' manual one below (both visibilities); takes a
 * transaction client so both insert atomically alongside their own other
 * writes, same reason as notifyInvitedUsers. Logs the broadcast row even
 * when `userIds` is empty (a resend that reaches no one is still a real,
 * timestamped attempt worth showing in the trail).
 */
async function broadcastEventNotification(
  tx: Prisma.TransactionClient,
  params: {
    eventId: string;
    sentById: string;
    type: NotificationType;
    message: string;
    userIds: string[];
    /** Anonymous EventRegistration guests reached by email alongside this send (resendEventNotifications, `open` events only) — they have no User account, so they're folded into the logged recipientCount without a bell Notification row of their own. */
    extraRecipientCount?: number;
  },
): Promise<{ id: string; sentAt: Date }> {
  if (params.userIds.length > 0) {
    const link = `/calendar/${params.eventId}`;
    await tx.notification.createMany({
      data: params.userIds.map((userId) => ({
        recipientId: userId,
        type: params.type,
        message: params.message,
        link,
      })),
    });
  }
  return tx.eventNotificationBroadcast.create({
    data: {
      eventId: params.eventId,
      sentById: params.sentById,
      recipientCount: params.userIds.length + (params.extraRecipientCount ?? 0),
    },
    select: { id: true, sentAt: true },
  });
}

/**
 * Emails every member the same "community event" copy, best-effort —
 * counterpart to broadcastEventNotification. `isReminder` swaps the
 * "scheduled a new event" copy for "reminder" copy on a manual resend
 * (resendEventNotifications) — the automatic send at creation time never
 * sets it.
 */
async function emailEventBroadcast(
  users: { email: string; name: string | null }[],
  params: {
    eventId: string;
    title: string;
    description: string | null;
    hostName: string;
    startsAt: Date;
    timezone: string | null;
    isReminder?: boolean;
  },
): Promise<void> {
  if (users.length === 0) return;
  const link = `${APP_URL}/calendar/${params.eventId}`;
  await Promise.allSettled(
    users.map((user) =>
      sendEventAnnouncementEmail(user.email, user.name ?? "there", {
        hostName: params.hostName,
        title: params.title,
        description: params.description,
        startsAt: params.startsAt,
        timezone: params.timezone,
        link,
        isReminder: params.isReminder,
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
    meetingUrl: string | null;
    deidentificationConfirmed: boolean;
    timezone: string | null;
    heroImage: File | null;
    visibility: EventVisibility;
    invitedUserIds: string[];
    /** Recording Access initiative — members granted co-host (recording start/stop, managing further co-hosts) from creation. Optional, any visibility — unlike invitedUserIds. */
    coHostUserIds: string[];
    meetLinkSource: "auto" | "manual" | "livekit";
    /** Optional waiting-room greeting shown to attendees on /meet/event/[id] before Start (meeting-join-experience). */
    meetingOrganizerMessage: string | null;
    meetingOrganizerMessageImage: File | null;
    recurrence: {
      frequency: RecurrenceFrequency;
      interval: number;
      byWeekday: number[];
      until: string | null;
    } | null;
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

  let recurrenceUntil: Date | null = null;
  if (input.recurrence?.until) {
    recurrenceUntil = new Date(input.recurrence.until);
    if (Number.isNaN(recurrenceUntil.getTime())) {
      throw new EventError(400, '"Repeat until" date isn\'t valid.');
    }
  }
  const recurrenceInput: RecurrenceInput | null = input.recurrence
    ? {
        frequency: input.recurrence.frequency,
        interval: input.recurrence.interval,
        byWeekday: input.recurrence.frequency === RecurrenceFrequency.weekly ? input.recurrence.byWeekday : [],
        until: recurrenceUntil,
      }
    : null;
  const recurrenceRuleString = recurrenceInput ? buildRRuleString(recurrenceInput, startsAt) : null;

  // Belt-and-suspenders: createEventSchema already blocks an unconfirmed
  // Case Discussion client- and server-side, but this is the one place no
  // caller of createEvent — schema-validated or not — can bypass it.
  if (input.type === EventType.case_discussion && !input.deidentificationConfirmed) {
    throw new EventError(400, "Case Discussion events require the de-identification confirmation.");
  }

  const isRestricted = input.visibility === EventVisibility.invited;

  // Belt-and-suspenders, same rationale — createEventSchema already blocks
  // this combination. The real enforcement point against a leftover/bypassed
  // `open: true` on a restricted event is registerForEvent's own visibility
  // check below, but this stops it from ever being set at creation time.
  if (isRestricted && input.open) {
    throw new EventError(400, "Restricted events can't be open to the public.");
  }

  // Belt-and-suspenders, same rationale as the Case Discussion check above —
  // createEventSchema already requires at least one invitee for a restricted
  // event, but this is the one place no caller can bypass it. Invitees are
  // re-resolved against the same listInDirectory + DIRECTORY_TIERS
  // eligibility that gates mentions/Directory search (§4.5/§4.8/§4.13) —
  // ids that don't match (e.g. a Friend-tier or delisted member) are
  // silently dropped rather than erroring, same "ids that aren't eligible
  // are simply absent" precedent as getDirectoryMembersByIds. The host is
  // excluded too — they're already implicitly "in" the event as its
  // organizer, so being listed as an invitee as well would double-count
  // them (their own "please RSVP" notification, a redundant EventInvitee
  // row, a duplicate line in their own roster) — same exclusion
  // updateEventInvitees already applies when editing the list later.
  const invitedUsers = isRestricted
    ? await db.user.findMany({
        where: {
          id: { in: input.invitedUserIds, notIn: [hostId] },
          tier: { in: DIRECTORY_TIERS },
          profile: { listInDirectory: true },
        },
        select: { id: true, email: true, name: true },
      })
    : [];
  if (isRestricted && invitedUsers.length === 0) {
    throw new EventError(400, "Select at least one member to invite.");
  }

  // Recording Access initiative — unlike invitedUserIds, co-hosts apply to
  // any visibility (a community/open event has no invited list at all, but
  // can still have co-hosts) and are always optional. Same eligibility
  // re-resolution and host-exclusion precedent as invitedUsers above.
  const coHostUsers = await db.user.findMany({
    where: {
      id: { in: input.coHostUserIds, notIn: [hostId] },
      tier: { in: DIRECTORY_TIERS },
      profile: { listInDirectory: true },
    },
    select: { id: true },
  });

  // A community event has no invitee list of its own — its "audience" is
  // every member, discovered via RSVP after the fact — so it's announced to
  // everyone instead, same recipient query as
  // announcements-server.ts's board_announcement broadcast. The host is
  // excluded — they don't need a notification about the event they just
  // scheduled.
  const publicEventRecipients = !isRestricted
    ? await db.user.findMany({
        where: { role: { in: [Role.member, Role.moderator, Role.admin] }, tier: { not: null }, id: { not: hostId } },
        select: { id: true, email: true, name: true },
      })
    : [];

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
  } else if (isRestricted) {
    heroImageUrl = RESTRICTED_EVENT_DEFAULT_HERO_KEY;
  }

  let meetingOrganizerMessageImageKey: string | null = null;
  if (input.meetingOrganizerMessageImage) {
    try {
      meetingOrganizerMessageImageKey = await uploadMeetingMessageImage(input.meetingOrganizerMessageImage);
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
  // Auto-generate applies to every event, not just restricted ones —
  // `invitedUsers` is [] for a community event, so this naturally reduces
  // to "host only" as the Calendar attendee list there; a community
  // event's real audience is discovered later via RSVP, not known upfront.
  let meetingUrl = input.meetingUrl;
  let googleEventId: string | null = null;
  let livekitRoomName: string | null = null;
  // Pre-generated only for the livekit path: the Calendar invite needs to
  // link to this event's own in-app meeting page, but that call happens
  // before the Event row (and its DB-generated id) exists below. Reused as
  // both the Event's id and the LiveKit room name — no reason for them to
  // differ, and it saves a second random value.
  const preGeneratedEventId = input.meetLinkSource === "livekit" ? randomUUID() : null;

  if (input.meetLinkSource === "auto" && host) {
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
      recurrenceRule: recurrenceRuleString ?? undefined,
      timeZone: input.timezone,
    });
    meetingUrl = created.meetingUrl;
    googleEventId = created.googleEventId;
  } else if (input.meetLinkSource === "livekit" && host && preGeneratedEventId) {
    livekitRoomName = await createLiveKitRoom(preGeneratedEventId, input.title);
    const attendees = [
      { email: host.email, name: hostName },
      ...invitedUsers.map((user) => ({ email: user.email, name: user.name ?? "Member" })),
    ];
    const created = await createLiveKitMeetingCalendarEvent({
      topic: input.title,
      startsAt,
      durationMinutes: endsAt ? Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000) : undefined,
      attendees,
      description: input.description ?? undefined,
      recurrenceRule: recurrenceRuleString ?? undefined,
      timeZone: input.timezone,
      meetingPageUrl: `${APP_URL}/meet/event/${preGeneratedEventId}`,
    });
    googleEventId = created.googleEventId;
  }

  const event = await db.$transaction(async (tx) => {
    const created = await tx.event.create({
      data: {
        ...(preGeneratedEventId ? { id: preGeneratedEventId } : {}),
        title: input.title,
        description: input.description,
        type: input.type,
        hostId,
        startsAt,
        endsAt,
        timezone: input.timezone,
        open: input.open,
        heroImageUrl,
        meetingUrl,
        googleEventId,
        livekitRoomName,
        visibility: input.visibility,
        deidentificationConfirmed: input.deidentificationConfirmed,
        meetingOrganizerMessage: input.meetingOrganizerMessage,
        meetingOrganizerMessageImageKey,
      },
      select: { id: true },
    });

    if (recurrenceInput) {
      await tx.eventRecurrence.create({
        data: {
          eventId: created.id,
          frequency: recurrenceInput.frequency,
          interval: recurrenceInput.interval,
          byWeekday: recurrenceInput.byWeekday,
          until: recurrenceInput.until,
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

    if (coHostUsers.length > 0) {
      await tx.eventCoHost.createMany({
        data: coHostUsers.map((user) => ({ eventId: created.id, userId: user.id })),
      });
    }

    if (!isRestricted) {
      const when = formatEventDateTime(startsAt, input.timezone);
      await broadcastEventNotification(tx, {
        eventId: created.id,
        sentById: hostId,
        type: NotificationType.event_published,
        message: `${hostName} scheduled a new event: "${input.title}" on ${when}.`,
        userIds: publicEventRecipients.map((user) => user.id),
      });
    }

    return created;
  });

  // Best-effort, same rationale as every other email in lib/email.ts — the
  // Event/EventInvitee/Notification rows already exist by this point, so a
  // failed/unconfigured send must not undo the creation.
  await emailInvitedUsers(invitedUsers, {
    eventId: event.id,
    title: input.title,
    hostName,
    startsAt,
    timezone: input.timezone,
  });
  await emailEventBroadcast(publicEventRecipients, {
    eventId: event.id,
    title: input.title,
    description: input.description,
    hostName,
    startsAt,
    timezone: input.timezone,
  });

  return { id: event.id };
}

/**
 * "Resend Notifications" (event detail page) — lets an event's host, or an
 * admin, re-send its announcement, e.g. as a reminder closer to the date.
 * Host/admin gate mirrors updateEvent's; blocked once cancelled (its
 * audience, if any, already got an event_cancelled notification instead).
 *
 * Branches on visibility for who gets notified and what the copy says: a
 * community event re-broadcasts to every member (mirrors createEvent's
 * automatic member-wide send); a restricted event re-sends only to its
 * current EventInvitee list, reusing the same "please RSVP" copy
 * (sendEventInviteEmail) an invitee got when first added — an invite list
 * can change after creation (updateEventInvitees), so this always resends
 * against who's invited *now*, not whoever was invited at creation time.
 * Either way the send is logged to the same EventNotificationBroadcast
 * trail, which doesn't distinguish audience type — it's just "who resent
 * this, when, to how many." A community event that's also `open` (register-
 * without-membership) additionally re-emails its anonymous EventRegistration
 * guests — no User account, so no bell notification, just the email — and
 * their count is folded into both the returned and logged recipientCount.
 */
export async function resendEventNotifications(
  eventId: string,
  actingUser: UserModel,
): Promise<{ recipientCount: number }> {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      title: true,
      description: true,
      startsAt: true,
      timezone: true,
      visibility: true,
      open: true,
      meetingUrl: true,
      livekitRoomName: true,
      hostId: true,
      cancelledAt: true,
    },
  });
  if (!event) throw new EventError(404, "Event not found.");

  const isAdmin = actingUser.role === Role.admin;
  const isHost = event.hostId === actingUser.id;
  if (!isAdmin && !isHost) {
    throw new EventError(403, "Only the event's host or an admin can resend notifications.");
  }
  if (event.cancelledAt) {
    throw new EventError(400, "This event has been cancelled.");
  }

  const host = await db.user.findUnique({ where: { id: event.hostId }, select: { name: true } });
  const hostName = host?.name ?? "A member";
  const isRestricted = event.visibility === EventVisibility.invited;

  const recipients = isRestricted
    ? (
        await db.eventInvitee.findMany({
          where: { eventId: event.id },
          select: { user: { select: { id: true, email: true, name: true } } },
        })
      ).map((invitee) => invitee.user)
    : await db.user.findMany({
        where: { role: { in: [Role.member, Role.moderator, Role.admin] }, tier: { not: null }, id: { not: event.hostId } },
        select: { id: true, email: true, name: true },
      });

  // A "truly public" event — open registration on top of community
  // visibility — also has anonymous EventRegistration guests: no User
  // account, so no bell notification, but still worth re-emailing a
  // reminder to. `open` can never be true for a restricted event
  // (createEvent/updateEvent both block that combination), so this is
  // naturally empty on the isRestricted branch.
  const registrations = !isRestricted && event.open
    ? await db.eventRegistration.findMany({ where: { eventId: event.id }, select: { email: true, name: true } })
    : [];

  const when = formatEventDateTime(event.startsAt, event.timezone);
  const message = isRestricted
    ? `Reminder from ${hostName}: please RSVP to "${event.title}" on ${when}.`
    : `Reminder from ${hostName}: "${event.title}" on ${when}.`;

  await db.$transaction((tx) =>
    broadcastEventNotification(tx, {
      eventId: event.id,
      sentById: actingUser.id,
      type: isRestricted ? NotificationType.event_invited : NotificationType.event_published,
      message,
      userIds: recipients.map((user) => user.id),
      extraRecipientCount: registrations.length,
    }),
  );

  if (isRestricted) {
    await emailInvitedUsers(recipients, {
      eventId: event.id,
      title: event.title,
      hostName,
      startsAt: event.startsAt,
      timezone: event.timezone,
    });
  } else {
    await emailEventBroadcast(recipients, {
      eventId: event.id,
      title: event.title,
      description: event.description,
      hostName,
      startsAt: event.startsAt,
      timezone: event.timezone,
      isReminder: true,
    });
  }

  if (registrations.length > 0) {
    await Promise.allSettled(
      registrations.map((registration) =>
        sendEventRegistrationReminderEmail(registration.email, registration.name ?? "there", {
          id: event.id,
          title: event.title,
          description: event.description,
          startsAt: event.startsAt,
          timezone: event.timezone,
          meetingUrl: event.meetingUrl,
          livekitRoomName: event.livekitRoomName,
          link: `${APP_URL}/events/${event.id}`,
        }),
      ),
    );
  }

  return { recipientCount: recipients.length + registrations.length };
}

/**
 * Resend Notifications' history trail (event detail page) — every
 * notification send for this event, newest first: the automatic one at
 * creation, plus any manual resend (either visibility — a community event's
 * broadcast to all members, or a restricted event's send to its invitees).
 * Host/admin-only, same "caller enforces the gate" convention as
 * getEventAttendees — the page only calls this once it's already confirmed
 * the viewer is canEdit.
 */
export async function getEventNotificationBroadcasts(eventId: string): Promise<EventNotificationBroadcastItem[]> {
  const broadcasts = await db.eventNotificationBroadcast.findMany({
    where: { eventId },
    select: { id: true, sentAt: true, recipientCount: true, sentBy: { select: { name: true } } },
    orderBy: { sentAt: "desc" },
  });

  return broadcasts.map((broadcast) => ({
    id: broadcast.id,
    sentAt: broadcast.sentAt.toISOString(),
    sentByName: broadcast.sentBy.name ?? "A member",
    recipientCount: broadcast.recipientCount,
  }));
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
      meetingUrl: true,
      googleEventId: true,
      livekitRoomName: true,
      heroImageUrl: true,
      deidentificationConfirmed: true,
      hostId: true,
      visibility: true,
      meetingOrganizerMessage: true,
      meetingOrganizerMessageImageKey: true,
      recurrence: { select: RECURRENCE_SELECT },
    },
  });
  if (!event) return null;

  // Defaults the edit form's platform selector to whatever this event is
  // actually using right now — "none" (never set) falls back to "manual"
  // (an empty, fill-it-in-yourself link), same as a brand-new event's own
  // default in create mode.
  const derivedMeetLinkSource = deriveMeetLinkSource(event);
  const meetLinkSource = derivedMeetLinkSource === "none" ? "manual" : derivedMeetLinkSource;

  return {
    id: event.id,
    title: event.title,
    description: event.description,
    type: event.type,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt?.toISOString() ?? null,
    open: event.open,
    meetingUrl: event.meetingUrl,
    meetLinkSource,
    heroImageUrl: getEventHeroImageUrl(event.heroImageUrl),
    visibility: event.visibility,
    deidentificationConfirmed: event.deidentificationConfirmed,
    hostId: event.hostId,
    meetingOrganizerMessage: event.meetingOrganizerMessage,
    meetingOrganizerMessageImageUrl: getMeetingMessageImageUrl(event.meetingOrganizerMessageImageKey),
    recurrence: event.recurrence
      ? {
          frequency: event.recurrence.frequency,
          interval: event.recurrence.interval,
          byWeekday: event.recurrence.byWeekday,
          until: event.recurrence.until?.toISOString() ?? null,
        }
      : null,
  };
}

/**
 * Edits an existing event (§4.6, `PATCH /api/events/:id`), host or admin
 * only. Never adds or removes the linked discussion thread itself — that's
 * a one-time create-time decision (createEvent above) — but does keep the
 * thread's title in sync with the event's, same as
 * updateKnowledgeItem/ForumThread for the Library.
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
    meetingUrl: string | null;
    /** Only meaningful when it differs from the event's current platform (derived from meetingUrl/googleEventId/livekitRoomName below) — otherwise this is just "manual" carried along unchanged, same value every edit re-submits. */
    meetLinkSource: "auto" | "manual" | "livekit";
    deidentificationConfirmed: boolean;
    timezone: string | null;
    heroImage: File | null;
    /** Optional waiting-room greeting shown to attendees on /meet/event/[id] before Start (meeting-join-experience). */
    meetingOrganizerMessage: string | null;
    meetingOrganizerMessageImage: File | null;
    recurrence: {
      frequency: RecurrenceFrequency;
      interval: number;
      byWeekday: number[];
      until: string | null;
    } | null;
  },
): Promise<{ id: string }> {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      hostId: true,
      heroImageUrl: true,
      meetingOrganizerMessageImageKey: true,
      startsAt: true,
      endsAt: true,
      visibility: true,
      googleEventId: true,
      meetingUrl: true,
      livekitRoomName: true,
      recurrence: { select: RECURRENCE_SELECT },
      // Only ever non-empty for a restricted event — the attendee list a
      // regenerated Meet/LiveKit calendar event needs when switching
      // platforms below, same audience createEvent itself invites.
      invitees: { select: { user: { select: { email: true, name: true } } } },
    },
  });
  if (!event) throw new EventError(404, "Event not found.");

  const isAdmin = actingUser.role === Role.admin;
  const isHost = event.hostId === actingUser.id;
  if (!isAdmin && !isHost) {
    throw new EventError(403, "Only the event's host or an admin can edit it.");
  }

  // Visibility itself isn't editable via this form (see ManageInvitees for
  // the dedicated invited-list editor), but `open` still is — this stops a
  // restricted event from being flipped open to public registration via an
  // edit, the same gap createEvent's own check closes at creation time.
  if (event.visibility === EventVisibility.invited && input.open) {
    throw new EventError(400, "Restricted events can't be open to the public.");
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

  let recurrenceUntil: Date | null = null;
  if (input.recurrence?.until) {
    recurrenceUntil = new Date(input.recurrence.until);
    if (Number.isNaN(recurrenceUntil.getTime())) {
      throw new EventError(400, '"Repeat until" date isn\'t valid.');
    }
  }
  const recurrenceInput: RecurrenceInput | null = input.recurrence
    ? {
        frequency: input.recurrence.frequency,
        interval: input.recurrence.interval,
        byWeekday: input.recurrence.frequency === RecurrenceFrequency.weekly ? input.recurrence.byWeekday : [],
        until: recurrenceUntil,
      }
    : null;
  // Compared against the pre-update EventRecurrence fetched above (not the
  // input object identity) so re-submitting the form with an unchanged
  // repeat schedule never fires a needless Google Calendar patch below.
  const priorRecurrence = event.recurrence ? toRecurrenceInput(event.recurrence) : null;
  const recurrenceChanged = !recurrenceInputsEqual(recurrenceInput, priorRecurrence);
  const recurrenceRuleString = recurrenceInput ? buildRRuleString(recurrenceInput, startsAt) : null;

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

  let meetingOrganizerMessageImageKey = event.meetingOrganizerMessageImageKey;
  if (input.meetingOrganizerMessageImage) {
    try {
      meetingOrganizerMessageImageKey = await uploadMeetingMessageImage(input.meetingOrganizerMessageImage);
    } catch (error) {
      if (error instanceof UploadValidationError) {
        throw new EventError(400, error.message);
      }
      throw error;
    }
  }

  // Meeting Platform Switching — lets the host move an existing event
  // between Nasiha Conference (LiveKit), Google Meet (auto), and a manual
  // link after creation, mirroring createEvent's own meetLinkSource
  // branching.
  const currentMeetLinkSource = deriveMeetLinkSource(event);
  // "none" -> "manual" isn't a real platform switch, just a host typing a
  // link into a field that was previously empty — everything else
  // (including "manual" -> "manual" with a *different* link, which the
  // caller's own meetingUrl-changed check already covers separately) only
  // regenerates when the underlying platform itself actually changes.
  const platformChanged =
    input.meetLinkSource !== currentMeetLinkSource &&
    !(currentMeetLinkSource === "none" && input.meetLinkSource === "manual");

  let meetingUrl = input.meetingUrl;
  let googleEventId = event.googleEventId;
  let livekitRoomName = event.livekitRoomName;

  if (platformChanged) {
    // Best-effort cleanup of whatever calendar event backed the old link —
    // otherwise it lingers on every attendee's calendar as a stale invite
    // once it's no longer the real meeting. A LiveKit room needs no
    // equivalent cleanup call; an unused one just times out empty on its
    // own (see createLiveKitRoom's comment).
    if (event.googleEventId) {
      await cancelMeetingCalendarEvent(event.googleEventId);
    }

    meetingUrl = null;
    googleEventId = null;
    livekitRoomName = null;

    const host = await db.user.findUnique({ where: { id: event.hostId }, select: { email: true, name: true } });
    const hostName = host?.name ?? "A member";
    // Same audience createEvent itself invites: host plus, for a restricted
    // event, its current invitees — [] here for a community event, which
    // naturally reduces the attendee list to "host only", identical to
    // createEvent's own comment on this.
    const attendees = host
      ? [
          { email: host.email, name: hostName },
          ...event.invitees.map((invitee) => ({ email: invitee.user.email, name: invitee.user.name ?? "Member" })),
        ]
      : [];

    if (input.meetLinkSource === "auto" && host) {
      const created = await createMeetingCalendarEvent({
        topic: input.title,
        startsAt,
        durationMinutes: endsAt ? Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000) : undefined,
        attendees,
        description: input.description ?? undefined,
        recurrenceRule: recurrenceRuleString ?? undefined,
        timeZone: input.timezone,
      });
      meetingUrl = created.meetingUrl;
      googleEventId = created.googleEventId;
    } else if (input.meetLinkSource === "livekit" && host) {
      livekitRoomName = await createLiveKitRoom(event.id, input.title);
      const created = await createLiveKitMeetingCalendarEvent({
        topic: input.title,
        startsAt,
        durationMinutes: endsAt ? Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000) : undefined,
        attendees,
        description: input.description ?? undefined,
        recurrenceRule: recurrenceRuleString ?? undefined,
        timeZone: input.timezone,
        meetingPageUrl: `${APP_URL}/meet/event/${event.id}`,
      });
      googleEventId = created.googleEventId;
    } else {
      meetingUrl = input.meetingUrl;
    }
  }

  const updated = await db.$transaction(async (tx) => {
    const result = await tx.event.update({
      where: { id: event.id },
      data: {
        title: input.title,
        description: input.description,
        type: input.type,
        startsAt,
        endsAt,
        timezone: input.timezone,
        open: input.open,
        heroImageUrl,
        meetingUrl,
        googleEventId,
        livekitRoomName,
        deidentificationConfirmed: input.deidentificationConfirmed,
        meetingOrganizerMessage: input.meetingOrganizerMessage,
        meetingOrganizerMessageImageKey,
      },
      select: { id: true },
    });
    // Keep the auto-created discussion thread's title (set from
    // event.title at creation, §4.6) in sync with renames — a no-op
    // updateMany when the host didn't opt into a thread at creation time.
    await tx.forumThread.updateMany({
      where: { eventId: event.id },
      data: { title: input.title },
    });

    if (recurrenceInput) {
      await tx.eventRecurrence.upsert({
        where: { eventId: event.id },
        create: {
          eventId: event.id,
          frequency: recurrenceInput.frequency,
          interval: recurrenceInput.interval,
          byWeekday: recurrenceInput.byWeekday,
          until: recurrenceInput.until,
        },
        update: {
          frequency: recurrenceInput.frequency,
          interval: recurrenceInput.interval,
          byWeekday: recurrenceInput.byWeekday,
          until: recurrenceInput.until,
        },
      });
    } else if (event.recurrence) {
      await tx.eventRecurrence.delete({ where: { eventId: event.id } });
    }

    return result;
  });

  if (input.heroImage && event.heroImageUrl) {
    await deleteEventHeroImage(event.heroImageUrl);
  }
  if (input.meetingOrganizerMessageImage && event.meetingOrganizerMessageImageKey) {
    await deleteMeetingMessageImage(event.meetingOrganizerMessageImageKey);
  }

  // Compares against the pre-update values fetched above, not the input
  // strings, so e.g. re-submitting the form with the same time never fires
  // any of the below.
  const timeChanged =
    event.startsAt.getTime() !== startsAt.getTime() ||
    (event.endsAt?.getTime() ?? null) !== (endsAt?.getTime() ?? null);

  // Keep the underlying Google Calendar event's time in sync so Meet-linked
  // attendees' own calendars move too and Google emails them an updated
  // invite — applies to any event with an auto-generated Meet link
  // (googleEventId), not just restricted ones (see createEvent: Meet
  // auto-generation isn't restricted-only). Best-effort, same non-fatal
  // philosophy as every other Google call in this file. Skipped when
  // platformChanged already created this googleEventId fresh just above,
  // with the current startsAt/endsAt baked in from the start — patching it
  // again here would be a redundant, harmless-but-wasteful extra API call.
  if (timeChanged && googleEventId && !platformChanged) {
    await updateMeetingCalendarEventTime(googleEventId, startsAt, endsAt, input.timezone);
  }

  // Keep the underlying Google Calendar event's recurrence in sync when the
  // host changes (or adds/removes) the repeat schedule — same best-effort
  // philosophy as the time sync above, same platformChanged skip as above
  // (a freshly (re)created calendar event already carries the current rule).
  if (recurrenceChanged && googleEventId && !platformChanged) {
    await updateMeetingCalendarEventRecurrence(googleEventId, recurrenceRuleString);
  }

  // Reschedule notification (Objective 03) — every visibility now notifies
  // its committed audience via notifyEventAudience (shared with
  // cancelEvent), not just restricted events.
  if (timeChanged) {
    const when = formatEventDateTime(startsAt, input.timezone);
    await notifyEventAudience(eventId, event.visibility, {
      type: NotificationType.event_rescheduled,
      subject: `Rescheduled: ${input.title}`,
      message: `"${input.title}" has been rescheduled to ${when}.`,
    });
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
      timezone: true,
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

      const message = `You are no longer needed for "${event.title}".`;
      await tx.notification.createMany({
        data: removeIds.map((userId) => ({
          recipientId: userId,
          type: NotificationType.event_removed,
          message,
          // No link: removed invitees lose access to the event page, so a
          // stored link would 404. This is informational-only.
          link: null,
        })),
      });
    }
  });

  // Best-effort, same rationale as every other email/Google call in this
  // file — the DB rows already reflect the new invited list by this point.
  await Promise.all([
    emailInvitedUsers(newInvitees, {
      eventId,
      title: event.title,
      hostName,
      startsAt: event.startsAt,
      timezone: event.timezone,
    }),
    removeCandidates.length > 0
      ? Promise.allSettled(
          removeCandidates.map((row) =>
            sendEventLifecycleEmail(row.user.email, row.user.name ?? "there", {
              subject: `Update: ${event.title}`,
              message: `You are no longer needed for "${event.title}".`,
              // No link — same rationale as the in-app notification above.
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
 * Notifies everyone who committed to an event of a lifecycle change
 * (cancellation, reschedule) — for any visibility: restricted-event
 * invitees and anyone with a `going` RSVP get a bell notification + email
 * (deduped by userId, since a restricted-event member can be both invited
 * and RSVP'd); external `EventRegistration` signups — no `User` account,
 * so no bell notification is possible — get an email pointing at the
 * public /events listing instead of the member-only /calendar/[eventId]
 * link, since they can't sign in to reach it. Shared by cancelEvent and
 * updateEvent's reschedule path so both lifecycle events notify the same
 * audience the same way.
 */
async function notifyEventAudience(
  eventId: string,
  visibility: EventVisibility,
  notification: { type: NotificationType; subject: string; message: string },
): Promise<void> {
  const isRestricted = visibility === EventVisibility.invited;
  const [invitees, goingRsvps, registrations] = await Promise.all([
    isRestricted
      ? db.eventInvitee.findMany({
          where: { eventId },
          select: { userId: true, user: { select: { email: true, name: true } } },
        })
      : Promise.resolve([]),
    db.rSVP.findMany({
      where: { eventId, status: RSVPStatus.going },
      select: { userId: true, user: { select: { email: true, name: true } } },
    }),
    db.eventRegistration.findMany({ where: { eventId }, select: { email: true, name: true } }),
  ]);

  // Invitees ∪ RSVP'd members, deduped by userId — a restricted-event
  // member who is both invited and RSVP'd gets exactly one notification.
  const members = new Map<string, { email: string; name: string | null }>();
  for (const invitee of invitees) members.set(invitee.userId, invitee.user);
  for (const rsvp of goingRsvps) members.set(rsvp.userId, rsvp.user);

  if (members.size > 0) {
    const link = `/calendar/${eventId}`;
    await db.notification.createMany({
      data: Array.from(members.keys()).map((recipientId) => ({
        recipientId,
        type: notification.type,
        message: notification.message,
        link,
      })),
    });
    await Promise.allSettled(
      Array.from(members.values()).map((member) =>
        sendEventLifecycleEmail(member.email, member.name ?? "there", {
          subject: notification.subject,
          message: notification.message,
          link: `${APP_URL}${link}`,
        }),
      ),
    );
  }

  if (registrations.length > 0) {
    await Promise.allSettled(
      registrations.map((registration) =>
        sendEventLifecycleEmail(registration.email, registration.name ?? "there", {
          subject: notification.subject,
          message: notification.message,
          link: `${APP_URL}/events`,
        }),
      ),
    );
  }
}

/**
 * Cancels an event (host or admin only) — a one-way, soft-delete-style flag
 * (Event.cancelledAt), not a status a host can clear. Also deletes the
 * underlying Google Calendar event if the Meet link was auto-generated.
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

  await db.event.update({ where: { id: eventId }, data: { cancelledAt: new Date() } });

  await notifyEventAudience(eventId, event.visibility, {
    type: NotificationType.event_cancelled,
    subject: `Cancelled: ${event.title}`,
    message: `${actingUser.name ?? "The host"} cancelled "${event.title}".`,
  });

  if (event.googleEventId) {
    await cancelMeetingCalendarEvent(event.googleEventId);
  }
}

/**
 * Deletes one occurrence's recording (host or admin only) — removes the
 * actual Drive file via the dedicated account, and only drops the
 * EventRecording row once that succeeds, so a failed Drive delete never
 * leaves an orphaned file with no DB record pointing back to it.
 */
export async function deleteEventRecording(
  eventId: string,
  occurrenceDate: Date,
  actingUser: UserModel,
): Promise<void> {
  const event = await db.event.findUnique({ where: { id: eventId }, select: { hostId: true } });
  if (!event) throw new EventError(404, "Event not found.");

  const isAdmin = actingUser.role === Role.admin;
  const isHost = actingUser.id === event.hostId;
  if (!isAdmin && !isHost) {
    throw new EventError(403, "Only the event's host or an admin can delete its recording.");
  }

  // findFirst, not findUnique on a compound key — [eventId, occurrenceDate]
  // is no longer unique now that a livekit-origin meeting can have multiple
  // segment rows for the same occurrence (see EventRecording's doc comment
  // in prisma/schema.prisma). This route only ever deletes the single
  // Drive-backed `meet` row, so origin is part of the lookup.
  const recording = await db.eventRecording.findFirst({
    where: { eventId, occurrenceDate, origin: RecordingOrigin.meet },
    select: { id: true, driveFileId: true },
  });
  if (!recording?.driveFileId) throw new EventError(404, "Recording not found.");

  const deleted = await deleteMeetingRecording(recording.driveFileId);
  if (!deleted) {
    throw new EventError(502, "Couldn't delete the recording — please try again.");
  }

  await db.eventRecording.delete({ where: { id: recording.id } });
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
): Promise<{ rsvped: boolean; meetingUrl: string | null; livekitRoomName: string | null; attendeeCount: number }> {
  const userId = actingUser.id;
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: {
      title: true,
      description: true,
      startsAt: true,
      endsAt: true,
      timezone: true,
      meetingUrl: true,
      livekitRoomName: true,
      hostId: true,
      visibility: true,
    },
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

  const rsvped = nextStatus === RSVPStatus.going;

  // Calendar-invite email — only on confirming `going`, not on cancelling
  // back out. Best-effort like every sendXEmail call in this file: the RSVP
  // row above already committed, so a failed/unconfigured send must not
  // fail the RSVP action itself.
  if (rsvped) {
    const icsFilename = `${event.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "event"}.ics`;
    await sendRsvpConfirmationEmail(actingUser.email, actingUser.name ?? "there", {
      id: eventId,
      title: event.title,
      startsAt: event.startsAt,
      timezone: event.timezone,
      meetingUrl: event.meetingUrl,
      livekitRoomName: event.livekitRoomName,
      link: `${APP_URL}/calendar/${eventId}`,
      icsContent: buildEventIcs({
        id: eventId,
        title: event.title,
        description: event.description,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        meetingUrl: event.meetingUrl,
        livekitRoomName: event.livekitRoomName,
      }),
      icsFilename,
    });
  }

  const [goingCount, registrationCount] = await Promise.all([
    db.rSVP.count({ where: { eventId, status: RSVPStatus.going } }),
    db.eventRegistration.count({ where: { eventId } }),
  ]);

  return {
    rsvped,
    // Same host exception as getMemberEvents/getMemberEventById.
    meetingUrl: rsvped || userId === event.hostId ? event.meetingUrl : null,
    livekitRoomName: rsvped || userId === event.hostId ? event.livekitRoomName : null,
    attendeeCount: goingCount + registrationCount,
  };
}

/**
 * Captures a non-member's email/name registering interest in an `open`
 * event from the public /events page — the anonymous counterpart to
 * rsvpToEvent above, but writing to EventRegistration (no userId) instead
 * of RSVP. Upserts on the `(eventId, email)` unique key so a repeat
 * submission from the same visitor is idempotent rather than an error.
 * Returns meetingUrl (the caller emails it in the confirmation) — the
 * public /events listing itself still never shows it (per Event's schema
 * comment); registering is the visitor's deliberate signal of intent to
 * attend, so it's the one place a guest does get the join link.
 */
export async function registerForEvent(
  eventId: string,
  input: { email: string; name: string },
): Promise<{
  id: string;
  title: string;
  startsAt: Date;
  timezone: string | null;
  meetingUrl: string | null;
  livekitRoomName: string | null;
  icsContent: string;
  icsFilename: string;
}> {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      title: true,
      description: true,
      startsAt: true,
      endsAt: true,
      timezone: true,
      open: true,
      visibility: true,
      meetingUrl: true,
      livekitRoomName: true,
    },
  });
  if (!event) throw new EventError(404, "Event not found.");
  // The real enforcement point: even if `open` were ever true on a
  // restricted event (blocked at creation/edit time, but this is a public,
  // unauthenticated route — nothing else stands between an anonymous caller
  // who has the event id and the invite-only guest list otherwise).
  if (!event.open || event.visibility === EventVisibility.invited) {
    throw new EventError(400, "This event isn't open for public registration.");
  }

  await db.eventRegistration.upsert({
    where: { eventId_email: { eventId, email: input.email } },
    create: { eventId, email: input.email, name: input.name },
    update: { name: input.name },
  });

  return {
    id: event.id,
    title: event.title,
    startsAt: event.startsAt,
    timezone: event.timezone,
    meetingUrl: event.meetingUrl,
    livekitRoomName: event.livekitRoomName,
    icsContent: buildEventIcs({
      id: event.id,
      title: event.title,
      description: event.description,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      meetingUrl: event.meetingUrl,
      livekitRoomName: event.livekitRoomName,
    }),
    icsFilename: `${event.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "event"}.ics`,
  };
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
  /** When meetingUrl is null and this is set, the event is LiveKit-backed — the join link is this event's own in-app meeting page instead of an external URL (LiveKit Meeting Infrastructure initiative). */
  livekitRoomName?: string | null;
  /** Series' repeat rule, if any — anchored at the master Event's own startsAt, per RFC 5545. */
  recurrence?: RecurrenceInput | null;
  recurrenceAnchor?: Date;
}): string {
  const start = formatIcsDate(event.startsAt);
  const end = formatIcsDate(event.endsAt ?? new Date(event.startsAt.getTime() + 60 * 60 * 1000));
  const joinUrl = event.meetingUrl ?? (event.livekitRoomName ? `${APP_URL}/meet/event/${event.id}` : null);
  const descriptionParts = [event.description, joinUrl ? `Join: ${joinUrl}` : null].filter(
    (part): part is string => Boolean(part),
  );

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Nasiha//Events//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    // RFC 5545: all instances of a recurring event share one UID — there's
    // no per-instance RECURRENCE-ID override given the app's no-exceptions
    // recurrence model (§4.6), so a single-occurrence download still just
    // carries the whole series' RRULE with that occurrence's own DTSTART/DTEND.
    `UID:${event.id}@nasihaonline`,
    `DTSTAMP:${formatIcsDate(new Date())}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
  ];
  if (descriptionParts.length > 0) {
    lines.push(`DESCRIPTION:${escapeIcsText(descriptionParts.join("\n\n"))}`);
  }
  if (joinUrl) {
    lines.push(`LOCATION:${escapeIcsText(joinUrl)}`);
  }
  if (event.recurrence) {
    lines.push(buildRRuleString(event.recurrence, event.recurrenceAnchor ?? event.startsAt));
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
export async function getEventIcs(
  eventId: string,
  userId: string | null,
  occurrenceStartIso?: string,
): Promise<{ title: string; ics: string } | null> {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      title: true,
      description: true,
      startsAt: true,
      endsAt: true,
      meetingUrl: true,
      livekitRoomName: true,
      hostId: true,
      recurrence: { select: RECURRENCE_SELECT },
    },
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

  // Same host exception as getMemberEvents/getMemberEventById/rsvpToEvent.
  const canSeeMeetingUrl = rsvped || (userId !== null && userId === event.hostId);

  let startsAt = event.startsAt;
  let endsAt = event.endsAt;
  if (event.recurrence && occurrenceStartIso) {
    const requested = new Date(occurrenceStartIso);
    if (!Number.isNaN(requested.getTime())) {
      const durationMs = event.endsAt ? event.endsAt.getTime() - event.startsAt.getTime() : null;
      startsAt = requested;
      endsAt = durationMs !== null ? new Date(requested.getTime() + durationMs) : null;
    }
  }

  return {
    title: event.title,
    ics: buildEventIcs({
      id: event.id,
      title: event.title,
      description: event.description,
      startsAt,
      endsAt,
      meetingUrl: canSeeMeetingUrl ? event.meetingUrl : null,
      livekitRoomName: canSeeMeetingUrl ? event.livekitRoomName : null,
      recurrence: event.recurrence ? toRecurrenceInput(event.recurrence) : null,
      recurrenceAnchor: event.startsAt,
    }),
  };
}

// ===== In-app meeting waiting room (meeting-join-experience) =====

/**
 * Powers both the server-rendered /meet/event/[id] page and its ~5s client
 * poll. Access mirrors getMemberEventById's exact existing rule so this
 * introduces no new exposure: unauthenticated access only for an `open`
 * event (same permissiveness as the plain, ungated meetingUrl already
 * emailed to anonymous registrants via sendEventRegistrationConfirmationEmail);
 * a signed-in non-host needs the same community/invitee visibility gate,
 * then the same rsvped-or-host gate that already controls whether the join
 * link appears anywhere else in the app.
 */
export async function getEventMeetingStatus(
  eventId: string,
  userId: string | null,
): Promise<{
  title: string;
  organizerName: string;
  started: boolean;
  startsAt: string;
  meetingUrl: string | null;
  /** Unlike meetingUrl, exposed regardless of `started` — a bare room name can't be used to join (the token-mint endpoint independently requires started), and the client needs to know the platform before Start to skip Meet's new-tab dance (LiveKit Meeting Infrastructure initiative). */
  livekitRoomName: string | null;
  organizerMessage: string | null;
  organizerMessageImageUrl: string | null;
  isOrganizer: boolean;
  /** Host or designated co-host (Recording Access initiative) — the two roles allowed to start/stop recording and manage further co-hosts. */
  isHostOrCoHost: boolean;
  /** The host's User.id, matching the `identity` LiveKit issues them (mintLiveKitToken) — lets the client's participant list identify which roster row is the host, distinct from `organizerName` (a display name, not an identity). */
  hostId: string;
  configured: boolean;
  /** Open events are reachable by never-vetted anonymous registrants (no membership application, so no prior Code of Conduct agreement) — gates the actual Meet redirect on a click-through agreement. Community/invited events skip this: every attendee there is already a member who agreed once at /join. */
  requiresCodeOfConductAgreement: boolean;
}> {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: {
      title: true,
      hostId: true,
      host: { select: { name: true } },
      startsAt: true,
      meetingUrl: true,
      livekitRoomName: true,
      meetingStartedAt: true,
      meetingOrganizerMessage: true,
      meetingOrganizerMessageImageKey: true,
      open: true,
      visibility: true,
      cancelledAt: true,
    },
  });
  if (!event || event.cancelledAt) throw new EventError(404, "Event not found.");

  const isHost = userId !== null && event.hostId === userId;
  const isHostOrCoHost = isHost || (userId !== null && (await isEventCoHost(eventId, userId)));

  if (userId === null) {
    if (!event.open) throw new EventError(403, "Sign in to view this meeting.");
  } else if (!isHost) {
    const visible =
      event.visibility === EventVisibility.community ||
      (await db.eventInvitee.findUnique({ where: { eventId_userId: { eventId, userId } } })) !== null;
    if (!visible) throw new EventError(404, "Event not found.");

    const rsvp = await db.rSVP.findUnique({
      where: { eventId_userId: { eventId, userId } },
      select: { status: true },
    });
    if (rsvp?.status !== RSVPStatus.going) {
      throw new EventError(403, "RSVP to this event to see the joining details.");
    }
  }

  return {
    title: event.title,
    organizerName: event.host.name ?? "NASIHA Member",
    started: event.meetingStartedAt !== null,
    startsAt: event.startsAt.toISOString(),
    meetingUrl: event.meetingStartedAt ? event.meetingUrl : null,
    livekitRoomName: event.livekitRoomName,
    organizerMessage: event.meetingOrganizerMessage,
    organizerMessageImageUrl: getMeetingMessageImageUrl(event.meetingOrganizerMessageImageKey),
    isOrganizer: isHost,
    isHostOrCoHost,
    hostId: event.hostId,
    configured: event.meetingUrl !== null || event.livekitRoomName !== null,
    requiresCodeOfConductAgreement: event.open,
  };
}

/** Recording Access initiative — is `userId` a designated co-host of `eventId`? DB is authoritative, not LiveKit's ephemeral room state (see EventCoHost's doc comment in schema.prisma). */
export async function isEventCoHost(eventId: string, userId: string): Promise<boolean> {
  const row = await db.eventCoHost.findUnique({
    where: { eventId_userId: { eventId, userId } },
    select: { id: true },
  });
  return row !== null;
}

/**
 * Grants or revokes co-host status for `targetUserId` on `eventId`, called
 * by an attendee during a live meeting. Authorization is enforced here
 * (same convention as updateEventInvitees above), not left to the route:
 * only the host or an existing co-host may call this, and the host itself
 * can't be targeted (fixed via Event.hostId, not toggleable). Returns the
 * event's full current co-host user-id list so the route can mirror it
 * into LiveKit room metadata for every connected client's participant list.
 */
export async function setEventCoHost(
  eventId: string,
  actingUserId: string,
  targetUserId: string,
  isCoHost: boolean,
): Promise<string[]> {
  const event = await db.event.findUnique({ where: { id: eventId }, select: { hostId: true, cancelledAt: true } });
  if (!event || event.cancelledAt) throw new EventError(404, "Event not found.");

  const actingIsHost = actingUserId === event.hostId;
  if (!actingIsHost && !(await isEventCoHost(eventId, actingUserId))) {
    throw new EventError(403, "Only the host or a co-host can manage co-hosts.");
  }
  if (targetUserId === event.hostId) {
    throw new EventError(400, "The host is already the host — co-host status doesn't apply to them.");
  }

  if (isCoHost) {
    const target = await db.user.findUnique({ where: { id: targetUserId }, select: { id: true } });
    if (!target) throw new EventError(404, "Member not found.");
    await db.eventCoHost.upsert({
      where: { eventId_userId: { eventId, userId: targetUserId } },
      create: { eventId, userId: targetUserId },
      update: {},
    });
  } else {
    await db.eventCoHost.deleteMany({ where: { eventId, userId: targetUserId } });
  }
  const rows = await db.eventCoHost.findMany({ where: { eventId }, select: { userId: true } });
  return rows.map((row) => row.userId);
}

/**
 * Attaches one finished LiveKit recording segment (objective 4) to whichever
 * Event owns `roomName`, called from the egress_ended webhook handler.
 * Upserted on `egressId` (unique) so a redelivered webhook is a no-op
 * rather than a duplicate row. Returns false if no Event owns this room
 * (the caller then tries the MeetingRequest side — see
 * attachLiveKitMeetingRequestRecordingSegment in meeting-requests-server.ts
 * — `livekitRoomName` is effectively unique across both tables, same
 * assumption resetMeetingOnRoomEmpty already relies on).
 *
 * occurrenceDate resolution for a recurring event mirrors
 * getMemberEventById's own "which occurrence" logic, just anchored to when
 * the recording actually started rather than to "now" — the closest
 * scheduled occurrence at or before segment.startedAt.
 */
export async function attachLiveKitEventRecordingSegment(
  roomName: string,
  segment: { egressId: string; objectKey: string | null; startedAt: Date; durationSeconds?: number },
): Promise<boolean> {
  const event = await db.event.findFirst({
    where: { livekitRoomName: roomName },
    select: { id: true, startsAt: true, recurrence: { select: RECURRENCE_SELECT } },
  });
  if (!event) return false;

  let occurrenceDate = event.startsAt;
  if (event.recurrence) {
    const rule = buildRRule(toRecurrenceInput(event.recurrence), event.startsAt);
    occurrenceDate = rule.before(segment.startedAt, true) ?? event.startsAt;
  }

  await db.eventRecording.upsert({
    where: { egressId: segment.egressId },
    create: {
      eventId: event.id,
      occurrenceDate,
      origin: RecordingOrigin.livekit,
      objectKey: segment.objectKey,
      egressId: segment.egressId,
      startedAt: segment.startedAt,
      durationSeconds: segment.durationSeconds,
    },
    // Called twice per segment: once at Record-click time with objectKey
    // null (creates the pending row), once from the egress_ended webhook
    // with the real key (fills it in). Only write objectKey/startedAt when
    // a real value is given, so the second call can't clobber an
    // already-resolved row back to null on a stray redelivery/race.
    update:
      segment.objectKey !== null
        ? { objectKey: segment.objectKey, startedAt: segment.startedAt, durationSeconds: segment.durationSeconds }
        : {},
  });
  return true;
}

/**
 * Marks a LiveKit recording segment as failed (egress_ended reported
 * EGRESS_FAILED/EGRESS_ABORTED/no file result) — updateMany rather than
 * update since the row is expected to exist (created at Record-click
 * time) but this must never throw if it somehow doesn't. Returns whether
 * a row was actually matched, same try-Event-then-MeetingRequest pattern
 * as attachLiveKitEventRecordingSegment's caller.
 */
export async function markLiveKitEventRecordingSegmentFailed(egressId: string): Promise<boolean> {
  const result = await db.eventRecording.updateMany({
    where: { egressId },
    data: { failedAt: new Date() },
  });
  return result.count > 0;
}

/**
 * Compiles this room's staged LiveKit chat messages (EventChatMessage,
 * captured live via POST /api/events/[id]/meeting/chat) into a single
 * chat-log-formatted ForumPost on the event's discussion thread, called
 * from the room_finished webhook handler right after
 * resetMeetingOnRoomEmpty. No-ops silently — never throws, matching every
 * other LiveKit webhook side-effect's best-effort philosophy — when there's
 * no matching Event, no discussion thread to post into, or no staged
 * messages. Posted as the event's own host (not a system/admin account —
 * there's no dedicated one in this app, and posting under an unrelated
 * admin's name read as confusing/misleading in practice), same as every
 * other post that host could make in their own event's thread.
 *
 * occurrenceDate resolution mirrors attachLiveKitEventRecordingSegment's
 * "closest scheduled occurrence at or before X" logic, anchored to the
 * room_finished instant rather than a recording's startedAt — this is what
 * lets a recurring event's separate occurrences each link to their own
 * transcript (EventChatTranscript) rather than one clobbering another's.
 */
export async function finalizeEventChatTranscript(roomName: string): Promise<void> {
  const event = await db.event.findFirst({
    where: { livekitRoomName: roomName },
    select: {
      id: true,
      hostId: true,
      forumThread: { select: { id: true } },
      timezone: true,
      startsAt: true,
      recurrence: { select: RECURRENCE_SELECT },
    },
  });
  if (!event?.forumThread) return;
  const threadId = event.forumThread.id;

  const messages = await db.eventChatMessage.findMany({
    where: { eventId: event.id },
    orderBy: { sentAt: "asc" },
  });
  if (messages.length === 0) return;

  const endedAt = new Date();
  let occurrenceDate = event.startsAt;
  if (event.recurrence) {
    const rule = buildRRule(toRecurrenceInput(event.recurrence), event.startsAt);
    occurrenceDate = rule.before(endedAt, true) ?? event.startsAt;
  }

  // ForumPost bodies render as plain text (forum-thread-view.tsx's single
  // whitespace-pre-wrap <p>, not Markdown) — Markdown emphasis here would
  // show up as literal asterisks, and single-\n-separated lines read as one
  // dense block. Each entry gets its own "Name — time" header line plus a
  // blank line before the next entry, so plain-text wrapping still reads
  // like a chat log instead of a wall of text.
  const heading = `Chat transcript — meeting adjourned ${formatEventDateTime(endedAt, event.timezone)}`;
  const entries = messages.map((message) => {
    const authorLabel =
      message.authorUserId === event.hostId ? `${message.authorName} (Organizer)` : message.authorName;
    return `${authorLabel} — ${formatEventTime(message.sentAt, event.timezone)}\n${message.body}`;
  });
  const body = [heading, ...entries].join("\n\n");

  const post = await createForumPost(
    threadId,
    event.hostId,
    { body, parentId: null, deidentificationConfirmed: false },
    true,
  );
  await enqueueForumThreadIndexSync(threadId);
  await db.eventChatTranscript.create({
    data: { eventId: event.id, occurrenceDate, forumPostId: post.id },
  });
  await db.eventChatMessage.deleteMany({ where: { eventId: event.id } });
}

/**
 * Access check for one LiveKit recording segment's streaming route
 * (app/api/events/[id]/recording/[recordingId]/route.ts) — same
 * rsvped-or-host visibility gate getMemberEventById already applies to
 * recordingUrl/liveKitRecordingSegments, re-derived here rather than
 * reused directly since the route only needs this one recording's object
 * key, not the whole event detail payload. Requires a signed-in userId,
 * same as getMemberEventById/deleteEventRecording — an open event's
 * anonymous attendee can join the live meeting, but recordings (Meet or
 * LiveKit) have never been exposed to a signed-out viewer anywhere in this
 * codebase, so this doesn't introduce a new anonymous-access case. Admins
 * are NOT special-cased here — that bypass is explicitly split into the
 * follow-on admin/Dashboard objective (c602a120), not this one.
 */
export async function getEventRecordingObjectKey(eventId: string, recordingId: string, userId: string): Promise<string> {
  const event = await db.event.findFirst({
    where: {
      id: eventId,
      OR: [{ visibility: EventVisibility.community }, { hostId: userId }, { invitees: { some: { userId } } }],
    },
    select: {
      hostId: true,
      rsvps: { where: { userId, status: RSVPStatus.going }, select: { id: true } },
    },
  });
  if (!event) throw new EventError(404, "Event not found.");

  const isHost = event.hostId === userId;
  const rsvped = event.rsvps.length > 0;
  if (!isHost && !rsvped) {
    throw new EventError(403, "RSVP to this event to view its recording.");
  }

  const recording = await db.eventRecording.findFirst({
    where: { id: recordingId, eventId, origin: RecordingOrigin.livekit },
    select: { objectKey: true },
  });
  if (!recording?.objectKey) throw new EventError(404, "Recording not found.");
  return recording.objectKey;
}

/**
 * Resolves the direct-download link (lib/google-calendar.ts's
 * getMeetingRecordingDownloadUrl) for one occurrence's Meet-origin
 * recording — same rsvped-or-host access gate getMemberEventById already
 * applies to `recordingUrl`, re-derived here for the same reason
 * getEventRecordingObjectKey re-derives it rather than reusing the whole
 * event detail payload.
 */
export async function getEventMeetRecordingDownloadUrl(
  eventId: string,
  occurrenceDate: Date,
  userId: string,
): Promise<string> {
  const event = await db.event.findFirst({
    where: {
      id: eventId,
      OR: [{ visibility: EventVisibility.community }, { hostId: userId }, { invitees: { some: { userId } } }],
    },
    select: {
      hostId: true,
      rsvps: { where: { userId, status: RSVPStatus.going }, select: { id: true } },
    },
  });
  if (!event) throw new EventError(404, "Event not found.");

  const isHost = event.hostId === userId;
  const rsvped = event.rsvps.length > 0;
  if (!isHost && !rsvped) {
    throw new EventError(403, "RSVP to this event to view its recording.");
  }

  const recording = await db.eventRecording.findFirst({
    where: { eventId, occurrenceDate, origin: RecordingOrigin.meet },
    select: { driveFileId: true },
  });
  if (!recording?.driveFileId) throw new EventError(404, "Recording not found.");

  const url = await getMeetingRecordingDownloadUrl(recording.driveFileId);
  if (!url) throw new EventError(502, "Couldn't get a download link — please try again.");
  return url;
}

/** Host-only: sets/edits the optional waiting-room message + image shown to attendees before Start. */
export async function updateEventMeetingMessage(
  eventId: string,
  actingUser: UserModel,
  input: { message: string | null; image: File | null; removeImage: boolean },
): Promise<void> {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { hostId: true, meetingOrganizerMessageImageKey: true },
  });
  if (!event) throw new EventError(404, "Event not found.");
  if (event.hostId !== actingUser.id) {
    throw new EventError(403, "Only the event's host can edit this message.");
  }

  let imageKey = event.meetingOrganizerMessageImageKey;
  if (input.image) {
    try {
      imageKey = await uploadMeetingMessageImage(input.image);
    } catch (error) {
      if (error instanceof UploadValidationError) throw new EventError(400, error.message);
      throw error;
    }
  } else if (input.removeImage) {
    imageKey = null;
  }

  await db.event.update({
    where: { id: eventId },
    data: { meetingOrganizerMessage: input.message, meetingOrganizerMessageImageKey: imageKey },
  });

  if (imageKey !== event.meetingOrganizerMessageImageKey && event.meetingOrganizerMessageImageKey) {
    await deleteMeetingMessageImage(event.meetingOrganizerMessageImageKey);
  }
}

/** Host-only: marks the meeting live, triggering waiting attendees' auto-redirect on their next poll. No-op if the event has no meeting link/room configured (neither Meet nor LiveKit) — mirrors google-calendar.ts's non-fatal philosophy. */
export async function startEventMeeting(eventId: string, actingUser: UserModel): Promise<void> {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { hostId: true, meetingUrl: true, livekitRoomName: true },
  });
  if (!event) throw new EventError(404, "Event not found.");
  if (event.hostId !== actingUser.id) {
    throw new EventError(403, "Only the event's host can start the meeting.");
  }
  // Bug fixed 2026-08-24: this only checked meetingUrl, so clicking "Start
  // Meeting" silently no-op'd for every LiveKit-backed event — meetingUrl
  // is always null there, livekitRoomName is used instead.
  if (!event.meetingUrl && !event.livekitRoomName) return;

  await db.event.update({
    where: { id: eventId },
    data: { meetingStartedAt: new Date(), meetingEndedAt: null },
  });
}

/**
 * Host-only: un-starts the meeting — meetingStartedAt has no "ended"
 * concept (no Meet API polling), so this is the only way to make the
 * waiting room apply again after a Start click (e.g. started too early,
 * or reusing the flow for a recurring series' next occurrence, which
 * shares this same Event row).
 */
export async function resetEventMeeting(eventId: string, actingUser: UserModel): Promise<void> {
  const event = await db.event.findUnique({ where: { id: eventId }, select: { hostId: true } });
  if (!event) throw new EventError(404, "Event not found.");
  if (event.hostId !== actingUser.id) {
    throw new EventError(403, "Only the event's host can reset the meeting.");
  }

  await db.event.update({ where: { id: eventId }, data: { meetingStartedAt: null } });
}
