// Client-safe Events types/constants (PRD §4.6) — kept separate from
// events-server.ts so client components can import them without pulling
// in the "server-only" query logic.
import { EventType, Tier } from "@/lib/generated/prisma/enums";

// §11 open question #2 ("which tiers can submit events — Active only, or
// Active + Associate? Not specified") — defaulted to Active tier per this
// objective's build instruction. Active is already §2.2's top tier (nothing
// ranks above it), so "Active and above" resolves to just this one tier.
// Revisit if the org confirms Associate should also be able to submit.
export const EVENT_SUBMISSION_TIERS: Tier[] = [Tier.active];

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
  icon: string | null;
  hostName: string | null;
};

// /events for a signed-in viewer (§4.6): same shape the public listing gets
// (meetingUrl deliberately still excluded — it never reaches this page, per
// §4.6's explicit "not on the public /events listing" rule, even for a
// member who's RSVP'd) plus whether *this* viewer is RSVP'd, so the
// members-only card's CTA can render as an RSVP toggle instead of "Join to
// RSVP".
export type EventWithRsvp = PublicEvent & {
  rsvped: boolean;
};

// /calendar (member-only route, §4.6) — the one place meetingUrl is ever
// exposed, and only when `rsvped` is true for this viewer.
export type MemberEvent = EventWithRsvp & {
  meetingUrl: string | null;
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
