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
