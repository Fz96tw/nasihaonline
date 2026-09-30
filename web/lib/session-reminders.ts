// Client-safe types + pure state logic for the floating session reminder
// (components/sessions/session-reminder.tsx). Times are ISO strings from
// /api/session-reminders; "now" is always passed in so this stays testable.

/** "Starting soon" begins this long before the scheduled start. */
export const REMINDER_LEAD_MS = 15 * 60_000;
/** How long the Snooze action hides a card before it comes back. */
export const SNOOZE_MS = 5 * 60_000;

export type ReminderState = "soon" | "live";

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
};

export type ReminderPrefs = {
  /** `${sessionKey}|${state}` -> true */
  dismissed: Record<string, true>;
  /** `${sessionKey}|${state}` -> epoch ms the snooze expires */
  snoozedUntil: Record<string, number>;
};

export const EMPTY_PREFS: ReminderPrefs = { dismissed: {}, snoozedUntil: {} };

export function prefKey(sessionKey: string, state: ReminderState) {
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
 * Sessions that should currently be on screen, soonest first. Dismiss and
 * snooze are per (session, state), so dismissing/snoozing "soon" never hides
 * the "live" card for the same session once it starts.
 */
export function pickVisibleReminders(
  sessions: ReminderSession[],
  prefs: ReminderPrefs,
  now: number,
): { session: ReminderSession; state: ReminderState }[] {
  return sessions
    .flatMap((session) => {
      const state = reminderStateOf(session, now);
      if (!state) return [];
      const key = prefKey(session.key, state);
      if (prefs.dismissed[key]) return [];
      if ((prefs.snoozedUntil[key] ?? 0) > now) return [];
      return [{ session, state }];
    })
    .sort((a, b) => Date.parse(a.session.startsAt) - Date.parse(b.session.startsAt));
}

/** A snooze never outlives the session itself. */
export function snoozeUntil(session: ReminderSession, now: number) {
  return Math.min(now + SNOOZE_MS, Date.parse(session.endsAt));
}
