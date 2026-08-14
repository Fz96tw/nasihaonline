/**
 * Formats a timestamp as "Mon D, h:mm AM/PM".
 *
 * Built from separate date/time Intl calls joined with a fixed literal
 * instead of passing combined date+time fields to a single
 * toLocaleString/toLocaleDateString call. The combined form lets the
 * JS engine pick its own date/time joiner from ICU data, which differs
 * between Node's bundled ICU (server) and the browser's ICU (client) —
 * e.g. ", " on one, " at " on the other — causing React hydration
 * mismatches. Joining manually keeps SSR and client output identical.
 */
export function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const datePart = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const timePart = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${datePart}, ${timePart}`;
}

// Fallback for events created before Event.timezone existed (nullable
// backfill gap) — arbitrary but fixed, so old rows format consistently
// rather than drifting with wherever the server process happens to run.
const DEFAULT_EVENT_TIME_ZONE = "America/New_York";

/**
 * Formats an event's start (or any event-related) instant as e.g.
 * "Tuesday, January 6, 2026 at 7:00 PM", in the given IANA timezone —
 * normally Event.timezone, the zone captured from the organizer's browser
 * at create/edit time. Without an explicit `timeZone` here,
 * toLocaleString falls back to the *server process's* timezone (Node
 * defaults to UTC in this app's containers), which is almost never the
 * timezone the organizer actually meant — that was the bug this exists to
 * prevent from recurring at each new call site.
 */
export function formatEventDateTime(date: Date, timeZone?: string | null): string {
  return date.toLocaleString("en-US", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: timeZone ?? DEFAULT_EVENT_TIME_ZONE,
  });
}

/** "Just now" / "Xm ago" / "Xh ago" / "Xd ago", falling back to a short date past a week out. */
export function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMinutes = Math.round(diffMs / 60_000);
  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
