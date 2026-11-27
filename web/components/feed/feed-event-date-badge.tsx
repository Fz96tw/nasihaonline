"use client";

import { useEffect, useState } from "react";
import { useHasMounted } from "@/lib/use-has-mounted";
import { cn } from "@/lib/utils";

// An event with no scheduled end is treated as running this long after its
// start, only for deciding "Live now" vs "Ended".
const ASSUMED_DURATION_MS = 60 * 60_000;
const DAY_MS = 24 * 60 * 60_000;

export type EventStatus =
  | { kind: "live" }
  | { kind: "ended" }
  | { kind: "soon"; label: string }
  | { kind: "later" };

function localMidnight(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function statusOf(start: Date, end: Date, now: Date): EventStatus {
  if (now >= end) return { kind: "ended" };
  if (now >= start) return { kind: "live" };
  // Calendar days in the viewer's own zone, not 24h blocks — an event at
  // 9am tomorrow is "Tomorrow" even when asked at 11pm tonight.
  const days = Math.round((localMidnight(start) - localMidnight(now)) / DAY_MS);
  if (days === 0) return { kind: "soon", label: "Today" };
  if (days === 1) return { kind: "soon", label: "Tomorrow" };
  if (days <= 6) return { kind: "soon", label: `In ${days} days` };
  return { kind: "later" };
}

/**
 * The event's live/ended/upcoming state against the viewer's clock — null
 * until mount (it depends on the viewer's own time and zone, so it can't be
 * part of the server render). Re-evaluated each minute so "Today" → "Live
 * now" → "Ended" flips without a reload on a feed left open. Shared by the
 * date badge and FeedEventFooter's RSVP/Join button so the two never disagree.
 */
export function useEventStatus(startsAt: string, endsAt?: string): EventStatus | null {
  const hasMounted = useHasMounted();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  if (!hasMounted) return null;
  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : new Date(start.getTime() + ASSUMED_DURATION_MS);
  return statusOf(start, end, now);
}

/**
 * Calendar-tile date badge for a feed event row: month band, large day
 * number, start time + zone, and a status footer ("Live now", "Today",
 * "Tomorrow", "In N days", "Ended") when one applies. `overlay` pins it to
 * the top-right of the row's hero image; `inline` sits to the right of the
 * title for an event row without an image.
 *
 * Every value depends on the viewer's own timezone/clock, so nothing is
 * rendered inside the tile until mount (same hydration guard the old
 * "Event Date:" line used) — the empty tile keeps its size so the row
 * doesn't shift when it fills in.
 */
export function FeedEventDateBadge({
  startsAt,
  endsAt,
  variant,
  rescheduled = false,
}: {
  startsAt: string;
  endsAt?: string;
  variant: "overlay" | "inline";
  /** The host moved this event: a "NEW DATE" strip tops the tile, so it's unambiguous that the date shown is the new one. */
  rescheduled?: boolean;
}) {
  const hasMounted = useHasMounted();
  const status = useEventStatus(startsAt, endsAt);
  const start = new Date(startsAt);
  const ended = status?.kind === "ended";

  const month = start.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
  const day = start.toLocaleDateString("en-US", { day: "numeric" });
  const time = start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const zone =
    start.toLocaleTimeString("en-US", { timeZoneName: "short" }).split(" ").pop() ?? "";
  const fullLabel = start.toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
  const statusText =
    status?.kind === "live" ? "Live now" : status?.kind === "ended" ? "Ended" : status?.kind === "soon" ? status.label : null;

  // Over a banner the tile is frosted glass (dark tint + backdrop blur, white
  // text with a shadow) so the image shows through but the text stays
  // readable on light and busy photos alike. Inline (no banner) has nothing
  // to show through, so it keeps a solid card.
  const glass = variant === "overlay";

  return (
    <div
      role="img"
      aria-label={hasMounted ? `Event ${ended ? "was" : rescheduled ? "rescheduled, now starts" : "starts"} ${fullLabel}${statusText ? ` — ${statusText}` : ""}` : "Event date"}
      className={cn(
        "flex w-[4.75rem] flex-shrink-0 flex-col overflow-hidden rounded-lg text-center",
        glass
          ? "absolute right-3 top-3 bg-black/40 text-white shadow-lg ring-1 ring-white/25 backdrop-blur-md [text-shadow:0_1px_4px_rgba(0,0,0,.6)] sm:w-[5.25rem]"
          : "border bg-card text-card-foreground shadow-sm",
      )}
    >
      {hasMounted ? (
        <>
          {rescheduled && !ended && (
            <div
              className={cn(
                "py-0.5 text-[10px] font-extrabold uppercase leading-tight tracking-wider",
                glass ? "bg-amber-300/90 text-amber-950 [text-shadow:none]" : "bg-amber-100 text-amber-900",
              )}
            >
              New date
            </div>
          )}
          <div
            className={cn(
              "py-0.5 text-xs font-bold tracking-wider",
              ended
                ? glass ? "bg-white/25 text-white" : "bg-neutral-500 text-white"
                : glass ? "bg-primary/85 text-primary-foreground" : "bg-primary text-primary-foreground",
            )}
          >
            {month}
          </div>
          <div
            className={cn(
              "pt-1 text-3xl font-extrabold leading-none sm:text-4xl",
              ended && (glass ? "text-white/70" : "text-neutral-500"),
            )}
          >
            {day}
          </div>
          <div
            className={cn(
              "mt-1 px-1 text-xs font-semibold leading-tight",
              ended && (glass ? "text-white/70" : "text-neutral-500"),
            )}
          >
            {time}
          </div>
          <div className={cn("pb-1 text-[10px] font-medium leading-tight", glass ? "text-white/80" : "text-neutral-500")}>
            {zone}
          </div>
          {statusText && (
            <div
              className={cn(
                "flex items-center justify-center gap-1 px-1 py-0.5 text-[10px] font-bold uppercase leading-tight tracking-normal",
                status?.kind === "live" && "bg-red-600/90 text-white",
                status?.kind === "ended" && (glass ? "bg-white/20 text-white" : "bg-neutral-200 text-neutral-600"),
                status?.kind === "soon" && (glass ? "bg-amber-300/90 text-amber-950 [text-shadow:none]" : "bg-amber-100 text-amber-900"),
              )}
            >
              {status?.kind === "live" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />}
              {statusText}
            </div>
          )}
        </>
      ) : (
        <div className="h-[5.5rem]" />
      )}
    </div>
  );
}
