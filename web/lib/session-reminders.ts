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
  /** Member live-events strip only: the member is the host or has a `going` RSVP, so Join goes straight to the meeting with no RSVP needed. */
  rsvped?: boolean;
  /** Public popup only: the host has started the meeting (Event.meetingStartedAt inside this occurrence's window). */
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

export function reminderStateOf(session: ReminderSession, now: number): ReminderState | null {
  const start = Date.parse(session.startsAt);
  const end = Date.parse(session.endsAt);
  if (Number.isNaN(start) || Number.isNaN(end) || now >= end) return null;
  if (now >= start) return "live";
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
      const key = prefKey(session.key, state);
      if (prefs.dismissed[key]) return [];
      if ((prefs.snoozedUntil[key] ?? 0) > now) return [];
      return [{ session, state }];
    })
    .sort((a, b) => Date.parse(a.session.startsAt) - Date.parse(b.session.startsAt));
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
