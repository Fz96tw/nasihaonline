import { formatInTimeZone } from "date-fns-tz";
import { EventType, EventVisibility, RecurrenceFrequency } from "@/lib/generated/prisma/enums";

export const LAST_MEET_LINK_SOURCE_KEY = "nasiha:lastMeetLinkSource";

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const HOUR_MS = 60 * 60 * 1000;

/**
 * "YYYY-MM-DDTHH:mm" wall-clock value → ms, as pure UTC maths (so the browser's
 * DST gaps can't shift it). Null for anything incomplete — and for years before
 * 1900, which is what a datetime-local reports mid-way through typing the year.
 */
function parseLocalMs(local: string): number | null {
  const m = LOCAL_RE.exec(local);
  if (!m || +m[1] < 1900) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
}

function formatLocalMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16);
}

export function isCompleteLocalValue(local: string): boolean {
  return parseLocalMs(local) !== null;
}

/** "YYYY-MM-DDTHH:mm" + 1 hour, as pure wall-clock arithmetic. */
export function addOneHour(local: string): string | null {
  const ms = parseLocalMs(local);
  return ms === null ? null : formatLocalMs(ms + HOUR_MS);
}

/**
 * How "Ends" should follow a change of "Starts": an end that was already set
 * keeps its distance from the start (move the start two hours later and the end
 * moves two hours too); a blank, or auto-filled, end becomes start + 1 hour.
 * Null means leave "Ends" alone.
 */
export function endFollowingStart(
  previousStart: string,
  newStart: string,
  end: string | null,
  endAutoFilled: boolean,
): { end: string; autoFilled: boolean } | null {
  const newMs = parseLocalMs(newStart);
  if (newMs === null) return null;
  const endMs = end ? parseLocalMs(end) : null;
  const previousMs = parseLocalMs(previousStart);
  if (endMs !== null && previousMs !== null && endMs >= previousMs) {
    return { end: formatLocalMs(endMs + (newMs - previousMs)), autoFilled: endAutoFilled };
  }
  if (!end || endAutoFilled) return { end: formatLocalMs(newMs + HOUR_MS), autoFilled: true };
  return null;
}

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function toggleWeekday(byWeekday: number[], day: number): number[] {
  return byWeekday.includes(day) ? byWeekday.filter((d) => d !== day) : [...byWeekday, day].sort((a, b) => a - b);
}

/** Default "Repeat until" when the checkbox is first turned on: 90 days after the event's start (or from now, if the start field isn't filled in yet). */
export function defaultUntilIso(startsAtLocal: string): string {
  const start = startsAtLocal ? new Date(startsAtLocal) : new Date();
  const anchor = Number.isNaN(start.getTime()) ? new Date() : start;
  return new Date(anchor.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString();
}

// The full IANA zone list — deterministic (not environment-dependent, unlike
// Intl.DateTimeFormat().resolvedOptions().timeZone below), so safe to
// compute once at module scope without an SSR/client mismatch.
export const IANA_TIMEZONES = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];

/**
 * Converts a stored UTC ISO timestamp to the "YYYY-MM-DDTHH:mm" wall-clock
 * value a <input type="datetime-local"> expects, as it reads in `timezone`
 * (the event's own stored zone in edit mode) — NOT the viewer's current
 * browser zone, so re-editing an event from a different zone than it was
 * created in doesn't silently show shifted times.
 */
export function toDatetimeLocalValue(iso: string | null, timezone: string): string {
  if (!iso) return "";
  return formatInTimeZone(iso, timezone, "yyyy-MM-dd'T'HH:mm");
}

// The three real audiences an event can have (§4.6) — modeled underneath as
// `visibility` (community | invited) crossed with a separate `open`
// boolean, but presented here as one choice so they can't be set into a
// contradictory combination (open + invited is rejected server-side).
export type AudienceChoice = "community" | "invited" | "open";

export const AUDIENCE_LABELS: Record<AudienceChoice, string> = {
  community: "Community — visible to every member",
  invited: "Restricted — invited members only",
  open: "Open to the public",
};

export const AUDIENCE_DESCRIPTIONS: Record<AudienceChoice, string> = {
  community: "Listed on /events, but only members can RSVP.",
  invited:
    "Visible only to you and the invited members below — invisible to everyone else, including the public /events listing.",
  open: 'Listed on /events with a "Register" action for signed-out visitors, in addition to member RSVP.',
};

export type ExistingEvent = {
  id: string;
  title: string;
  description: string | null;
  type: EventType;
  startsAt: string;
  endsAt: string | null;
  /** IANA zone the event was created/last saved in (see Event.timezone's schema comment) — null for legacy rows saved before this field existed. */
  timezone: string | null;
  open: boolean;
  /** Private guest-invite link is on (Event.guestLinkToken is set). */
  guestLinkEnabled: boolean;
  meetingUrl: string | null;
  meetLinkSource: "auto" | "manual" | "livekit";
  heroImageUrl: string | null;
  deidentificationConfirmed: boolean;
  visibility: EventVisibility;
  /** Community-based-categorization initiative, objective 5 — unlike invitedUserIds/coHostUserIds below, genuinely editable here, so this reflects the event's real current tags rather than being hardcoded empty. */
  communityIds: string[];
  /** Published with zero community tags = "All communities" (a still-draft with none selected is just unfinished, so false). */
  allCommunities: boolean;
  categoryIds: string[];
  meetingOrganizerMessage: string | null;
  meetingOrganizerMessageImageUrl: string | null;
  recurrence: {
    frequency: RecurrenceFrequency;
    interval: number;
    byWeekday: number[];
    until: string | null;
  } | null;
  /** Save as Draft initiative — null publishedAt means still-draft. */
  isDraft: boolean;
  /** Only meaningful while isDraft — otherwise create-only and unused, same as before this initiative. */
  invitedUserIds: string[];
  coHostUserIds: string[];
};
