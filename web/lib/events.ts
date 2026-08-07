// Client-safe Events types/constants (PRD §4.6) — kept separate from
// events-server.ts so client components can import them without pulling
// in the "server-only" query logic.
import { EventType, EventVisibility, Tier } from "@/lib/generated/prisma/enums";

// §11 open question #2 ("which tiers can submit events — Active only, or
// Active + Associate? Not specified") — resolved: Active, Associate, and
// Student can all submit events. Friend tier is excluded.
export const EVENT_SUBMISSION_TIERS: Tier[] = [Tier.active, Tier.associate, Tier.student];

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  [EventType.webinar]: "Webinar",
  [EventType.workshop]: "Workshop",
  [EventType.case_discussion]: "Case Discussion",
  [EventType.student_event]: "Student Event",
  [EventType.roundtable]: "Roundtable",
  [EventType.lecture]: "Lecture",
};

// The public /events listing (§4.5's unauthenticated route) — deliberately
// excludes meetingUrl and deidentificationConfirmed, neither of which is
// ever meant to reach an unauthenticated/non-RSVP'd visitor.
export type PublicEvent = {
  id: string;
  title: string;
  description: string | null;
  type: EventType;
  startsAt: string;
  endsAt: string | null;
  open: boolean;
  heroImageUrl: string | null;
  hostName: string | null;
};

// /events for a signed-in viewer (§4.6): same shape the public listing gets
// (meetingUrl deliberately still excluded — it never reaches this page, per
// §4.6's explicit "not on the public /events listing" rule, even for a
// member who's RSVP'd) plus whether *this* viewer is RSVP'd, so the
// members-only card's CTA can render as an RSVP toggle instead of "Join to
// RSVP". Also carries `visibility` — a restricted event can reach this page
// too (for its organizer/invitees, via getEventsForViewer's own filter), so
// its card needs to know to badge itself "Invitees Only" rather than
// "Members Only".
export type EventWithRsvp = PublicEvent & {
  rsvped: boolean;
  visibility: EventVisibility;
};

// /calendar (member-only route, §4.6) — the one place meetingUrl is ever
// exposed, and only when `rsvped` is true for this viewer.
export type MemberEvent = EventWithRsvp & {
  meetingUrl: string | null;
  /** True once the organizer has cancelled this event (getMemberEventById is the only MemberEvent query that ever sets this — listing queries filter cancelled events out entirely). */
  cancelled: boolean;
  /** Going RSVPs (members) plus EventRegistrations (non-members) — same merge as getEventEngagementForAdmin. */
  attendeeCount: number;
  /** So the detail page can gate its "Edit Event" link to the host or an admin. */
  hostId: string;
  /** Id of the Events-forum thread auto-created at submission time, if the host opted in — null otherwise. */
  forumThreadId: string | null;
  /** Reply count on that thread (post count minus the system-authored opening post) — null when forumThreadId is null. */
  forumReplyCount: number | null;
  /** Unique-visitor count for the event detail page's eye-icon (§4.6). */
  viewCount: number;
};

// Shared "Open" / "Members Only" / "Invitees Only" audience badge — used by
// every card/detail surface that shows event.open + event.visibility
// (EventListItem, EventDetail, EventCard) so the copy/color never drifts
// between them. A restricted event badges as "Invitees Only" instead of
// "Members Only" — `open` is always false for one (createEvent/updateEvent
// both block combining them), so this branch order is safe.
export function getEventAudienceBadge(event: {
  open: boolean;
  visibility: EventVisibility;
}): { label: string; variant: "success" | "info" | "warning" } {
  if (event.open) return { label: "Open", variant: "success" };
  if (event.visibility === EventVisibility.invited) return { label: "Invitees Only", variant: "warning" };
  return { label: "Members Only", variant: "info" };
}

// Full per-person invitee roster for a restricted event's detail page
// (Objective 02) — visible to every invited member, not just the
// organizer. `pending` = invited but no RSVP row yet.
export type EventRosterMember = {
  userId: string;
  name: string | null;
  avatarUrl: string | null;
  status: "pending" | "going" | "not_going";
};

// Shared between the read-only roster (EventDetail) and the host-facing
// editable one (ManageInvitees) so both surfaces present the exact same
// status labels/colors.
export const ROSTER_STATUS_LABEL: Record<EventRosterMember["status"], string> = {
  pending: "Invited",
  going: "Going",
  not_going: "Not going",
};

export const ROSTER_STATUS_VARIANT: Record<EventRosterMember["status"], "neutral" | "success" | "danger"> = {
  pending: "neutral",
  going: "success",
  not_going: "danger",
};

// Host-facing post-event attendance checklist for a restricted event
// (Objective 04) — every invited member, flagged with whether their
// attendee-role Attendance row (and confirmed Knowledge Hours earn)
// already exists.
export type AttendanceChecklistMember = {
  userId: string;
  name: string | null;
  avatarUrl: string | null;
  recorded: boolean;
};

// /calendar/[eventId]'s host/admin-only attendee list (§4.6) — RSVP'd
// members (name only, same "no raw contact info exposed" boundary as the
// Member Directory) and anonymously-registered guests (name + email, since
// email is the entire point of capturing an EventRegistration).
export type EventRsvpAttendee = {
  id: string;
  name: string | null;
};

export type EventRegistrationAttendee = {
  id: string;
  name: string | null;
  email: string;
};

// Dashboard's upcoming-events widget (§10 Phase 4 capstone) — a trimmed-down
// event shape for a small at-a-glance list, not the full calendar. Includes
// both this member's RSVP'd events and open events they haven't RSVP'd to
// yet, per the objective's "RSVP'd events, and/or upcoming open events".
export type DashboardUpcomingEvent = {
  id: string;
  title: string;
  type: EventType;
  startsAt: string;
  rsvped: boolean;
};

// /admin/events (§4.4/§4.6) — a past event awaiting (or already past) its
// host attendance-recording action, the trigger for the auto-earn ledger
// transaction.
export type PastEventForAttendance = {
  id: string;
  title: string;
  type: EventType;
  startsAt: string;
  hostId: string;
  hostName: string | null;
  attendanceRecorded: boolean;
};

// /members/[memberId]'s Events section (§4.5/§4.6) — events this member has
// hosted, newest first. Trimmed down like PublicEvent rather than the full
// MemberEvent shape: the viewer's own RSVP state isn't relevant to "did this
// person host it".
export type MemberHostedEvent = {
  id: string;
  title: string;
  type: EventType;
  startsAt: string;
  open: boolean;
  heroImageUrl: string | null;
  /** Set once the host has cancelled the event — null otherwise. Used by /my-posts to badge Upcoming/Past/Cancelled. */
  cancelledAt: string | null;
};
