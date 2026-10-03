// Client-safe types + pure state logic for the floating session reminder
// (components/sessions/session-reminder.tsx). Times are ISO strings from
// /api/session-reminders; "now" is always passed in so this stays testable.

/** "Starting soon" begins this long before the scheduled start. */
export const REMINDER_LEAD_MS = 15 * 60_000;
/** How long the Snooze action hides a card before it comes back. */
export const SNOOZE_MS = 5 * 60_000;

export type ReminderState = "soon" | "live";

/**
 * The signed-out (public) popup splits "live" in two: the scheduled start has
 * passed but the host hasn't started the meeting yet ("waiting"), versus the
 * host actually having started it ("started"). Each has its own dismiss/snooze
 * key, so dismissing one never hides the next.
 */
export type PublicReminderState = "soon" | "waiting" | "started";

/** Public events with no end time are treated as ending this long after their start. */
export const PUBLIC_DEFAULT_EVENT_MS = 30 * 60_000;

export type ReminderSession = {
  /** Stable per occurrence (event occurrenceId / meeting id) — dismiss/snooze are keyed on it. */
  key: string;
  kind: "event" | "meeting";
  title: string;
  /** e.g. "with Aisha" for a 1-on-1 meeting; null for events. */
  detail: string | null;
  startsAt: string;
  /** Effective end — the scheduled end, or start + a default window when none is set. */
  endsAt: string;
  joinHref: string;
  /** Public popup only: the Event.id (the series id for a recurring event), for the register/join flow. */
  eventId?: string;
  /** Member surfaces only: true = the member is the host / already `going` (Join goes straight to the meeting); false = they haven't RSVP'd (popup rows for visible events they haven't committed to — Join RSVPs silently, or the explicit RSVP button before the host starts); undefined = the existing RSVP'd/hosted reminder list. */
  rsvped?: boolean;
  /** The host has started the meeting (Event.meetingStartedAt inside this occurrence's window) — public popup rows and the member popup rows with `rsvped: false`. */
  started?: boolean;
  /** Public popup only: Event.open — registration is only offered for open events. */
  open?: boolean;
};

export type ReminderPrefs = {
  /** `${sessionKey}|${state}` -> true */
  dismissed: Record<string, true>;
  /** `${sessionKey}|${state}` -> epoch ms the snooze expires */
  snoozedUntil: Record<string, number>;
};

export const EMPTY_PREFS: ReminderPrefs = { dismissed: {}, snoozedUntil: {} };

export function prefKey(sessionKey: string, state: string) {
  return `${sessionKey}|${state}`;
}

/**
 * The dismiss/snooze key for a card in a given state. A member popup row the
 * host has started (`started`) gets its own key rather than sharing "live"
 * with "scheduled start passed, host hasn't started" — otherwise dismissing
 * the card while waiting would also hide it at the one moment that matters
 * (the host starting, when "Join now" appears). Rows without `started` (the
 * existing RSVP'd/hosted list, 1-on-1 meetings, the public popup's own three
 * states) keep exactly the keys they always had, so stored prefs still apply.
 */
export function reminderPrefKey(session: ReminderSession, state: string) {
  return prefKey(session.key, state === "live" && session.started ? "started" : state);
}

export function reminderStateOf(session: ReminderSession, now: number): ReminderState | null {
  const start = Date.parse(session.startsAt);
  const end = Date.parse(session.endsAt);
  if (Number.isNaN(start) || Number.isNaN(end) || now >= end) return null;
  // A host-started meeting (member popup rows for events the member hasn't
  // RSVP'd to carry `started`) is in progress even before its scheduled time.
  if (session.started || now >= start) return "live";
  if (now >= start - REMINDER_LEAD_MS) return "soon";
  return null;
}

/**
 * Public-popup counterpart of reminderStateOf: "started" once the host has
 * started the meeting (even slightly before the scheduled start), otherwise
 * "waiting" from the scheduled start, otherwise "soon" inside the lead
 * window. Nothing after the scheduled end.
 */
export function publicReminderStateOf(session: ReminderSession, now: number): PublicReminderState | null {
  const start = Date.parse(session.startsAt);
  const end = Date.parse(session.endsAt);
  if (Number.isNaN(start) || Number.isNaN(end) || now >= end) return null;
  if (session.started) return "started";
  if (now >= start) return "waiting";
  if (now >= start - REMINDER_LEAD_MS) return "soon";
  return null;
}

/**
 * How relevant a notice is right now — lower sorts first. A meeting the host
 * has STARTED beats everything (it's the one you can actually join); then
 * anything past its scheduled start that the member/visitor is committed to
 * (hosted / RSVP'd / not an RSVP-able row); then the same for events they
 * haven't RSVP'd to; then "starting soon", committed before not. Ties are
 * broken by start time (see compareReminders). Without this the earliest-
 * starting event wins, which can be a long-running meeting over one that's
 * about to begin or the one the member RSVP'd to.
 */
export function relevanceRank(session: ReminderSession, state: string): number {
  if (state === "started" || session.started === true) return 0;
  const committed = session.rsvped !== false;
  if (state === "live" || state === "waiting") return committed ? 1 : 2;
  return committed ? 3 : 4;
}

/** Sort comparator for `{ session, state }` notices: relevance first, then soonest start. */
export function compareReminders(
  a: { session: ReminderSession; state: string },
  b: { session: ReminderSession; state: string },
): number {
  return (
    relevanceRank(a.session, a.state) - relevanceRank(b.session, b.state) ||
    Date.parse(a.session.startsAt) - Date.parse(b.session.startsAt)
  );
}

function pickVisible<S extends string>(
  sessions: ReminderSession[],
  prefs: ReminderPrefs,
  now: number,
  stateOf: (session: ReminderSession, now: number) => S | null,
): { session: ReminderSession; state: S }[] {
  return sessions
    .flatMap((session) => {
      const state = stateOf(session, now);
      if (!state) return [];
      const key = reminderPrefKey(session, state);
      if (prefs.dismissed[key]) return [];
      if ((prefs.snoozedUntil[key] ?? 0) > now) return [];
      return [{ session, state }];
    })
    .sort(compareReminders);
}

/**
 * Sessions that should currently be on screen, soonest first. Dismiss and
 * snooze are per (session, state), so dismissing/snoozing "soon" never hides
 * the "live" card for the same session once it starts.
 */
export function pickVisibleReminders(sessions: ReminderSession[], prefs: ReminderPrefs, now: number) {
  return pickVisible(sessions, prefs, now, reminderStateOf);
}

/** Same as pickVisibleReminders, for the signed-out popup's three states. */
export function pickVisiblePublicReminders(sessions: ReminderSession[], prefs: ReminderPrefs, now: number) {
  return pickVisible(sessions, prefs, now, publicReminderStateOf);
}

/** A snooze never outlives the session itself. */
export function snoozeUntil(session: ReminderSession, now: number) {
  return Math.min(now + SNOOZE_MS, Date.parse(session.endsAt));
}
