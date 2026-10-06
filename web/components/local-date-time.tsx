"use client";

import { useHasMounted } from "@/lib/use-has-mounted";

/**
 * Renders a timestamp in the *viewer's* browser timezone. Server components
 * calling toLocaleString() directly format in the server process's zone
 * (UTC in this app's containers), so anything shown to a person in their
 * own zone has to be formatted client-side. Renders nothing until mounted
 * (see useHasMounted) so SSR and first-hydration output match.
 *
 * Built from separate date/time Intl calls for the same ICU-joiner
 * hydration reason documented on lib/format-date.ts's formatTimestamp.
 * `dateOnly` drops the time (and zone label) for compact table cells.
 */
export function LocalDateTime({ iso, dateOnly = false }: { iso: string; dateOnly?: boolean }) {
  const hasMounted = useHasMounted();
  if (!hasMounted) return null;
  const date = new Date(iso);
  const datePart = date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  if (dateOnly) return <>{datePart}</>;
  const timePart = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  return <>{`${datePart}, ${timePart}`}</>;
}
