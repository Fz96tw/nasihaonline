import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getEventAttendanceChecklist } from "@/lib/attendance-server";
import { getEventAttendees, getEventRoster, getMemberEventById } from "@/lib/events-server";
import { getDirectoryMemberById, getMentionableMembers } from "@/lib/members-server";
import { getForumThreadDetail } from "@/lib/forums-server";
import { EVENTS_FORUM_SLUG } from "@/lib/forums";
import { EventDetail } from "@/components/calendar/event-detail";
import { EventDiscussionLink } from "@/components/calendar/event-discussion-link";
import { ForumThreadView } from "@/components/forums/forum-thread-view";
import { BackLink } from "@/components/back-link";
import { EventVisibility, Role } from "@/lib/generated/prisma/enums";

export async function generateMetadata({ params }: { params: { eventId: string } }): Promise<Metadata> {
  const user = await getSessionUser();
  const event = user ? await getMemberEventById(user.id, params.eventId) : null;
  return { title: event ? `${event.title} — Calendar — NASIHA` : "Event unavailable — NASIHA" };
}

/** /calendar/[eventId] (§4.6) — single-event detail, member-only like /calendar itself. */
export default async function EventDetailPage({ params }: { params: { eventId: string } }) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const event = await getMemberEventById(user.id, params.eventId);
  if (!event) notFound();

  // A cancellation notification links straight here, so this can't 404 once
  // the organizer cancels (getMemberEventById deliberately doesn't filter
  // cancelledAt like the /calendar listing does) — show a plain "cancelled"
  // state instead of the full RSVP/edit/discussion detail view.
  if (event.cancelled) {
    return (
      <main className="mx-auto flex max-w-3xl flex-col gap-6 p-8">
        <BackLink fallbackHref="/calendar" />
        <div>
          <h1 className="mb-1 text-3xl font-bold tracking-tight">{event.title}</h1>
          {event.hostName ? <p className="text-sm text-muted-foreground">Hosted by {event.hostName}</p> : null}
        </div>
        <div className="rounded-lg border bg-muted px-4 py-3 text-sm text-muted-foreground">
          This event has been cancelled by the organizer.
        </div>
      </main>
    );
  }

  const isHost = user.id === event.hostId;
  const canEdit = isHost || user.role === Role.admin;
  // Full invitee roster (Objective 02) — visible to every invited member,
  // not just the organizer, so it's fetched independently of `canEdit`.
  // Only restricted events have one; reaching this point at all already
  // means the viewer is the organizer or an invited member (getMemberEventById's
  // own visibility gate), so no further permission check is needed here.
  const isRestricted = event.visibility === EventVisibility.invited;
  // Attendance checklist (Objective 04) — host/admin only, and only once
  // the event has actually happened, same startsAt < now gate the admin
  // queue's getPastEventsForAttendance() already uses.
  const isPast = new Date(event.startsAt) < new Date();
  // A restricted event has no use for this — RSVP status per invitee is
  // already covered by the roster/ManageInvitees block above, and
  // "registered guests" is structurally always empty (a restricted event
  // can never also be `open`, the only way EventRegistration rows exist).
  const [attendees, hostProfile, roster, attendanceChecklist] = await Promise.all([
    canEdit && !isRestricted ? getEventAttendees(event.id) : Promise.resolve(null),
    getDirectoryMemberById(event.hostId),
    isRestricted ? getEventRoster(event.id) : Promise.resolve(null),
    canEdit && isRestricted && isPast ? getEventAttendanceChecklist(event.id) : Promise.resolve(null),
  ]);

  const thread = event.forumThreadId
    ? await getForumThreadDetail(EVENTS_FORUM_SLUG, event.forumThreadId, user.id)
    : null;
  const mentionableMembers = thread ? await getMentionableMembers() : [];

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-8">
      <BackLink fallbackHref="/calendar" />

      <EventDetail
        event={event}
        canEdit={canEdit}
        isHost={isHost}
        attendees={attendees}
        hostProfile={hostProfile}
        roster={roster}
        attendanceChecklist={attendanceChecklist}
      />

      {!event.forumThreadId && (
        <div className="border-t pt-8">
          <EventDiscussionLink eventId={event.id} initialThreadId={event.forumThreadId} />
        </div>
      )}

      {thread && (
        <div className="border-t pt-8">
          <h2 className="mb-4 text-lg font-semibold">Discussion</h2>
          <ForumThreadView
            threadId={thread.id}
            // Drop the auto-authored opening post (always posts[0] — created
            // atomically with the thread in createEvent) linking back to this
            // event: redundant here since we're already on the event page.
            // The standalone /forums/[category]/[threadId] view keeps it.
            posts={thread.posts.slice(1)}
            requireDeidentification={false}
            mentionableMembers={mentionableMembers}
          />
        </div>
      )}
    </main>
  );
}
