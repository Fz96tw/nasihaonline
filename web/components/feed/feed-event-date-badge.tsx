"use client";

import { useEffect, useState } from "react";
import { useHasMounted } from "@/lib/use-has-mounted";
import { cn } from "@/lib/utils";

// An event with no scheduled end is treated as running this long after its
// start, only for deciding "Live now" vs "Ended".
const ASSUMED_DURATION_MS = 60 * 60_000;
const DAY_MS = 24 * 60 * 60_000;

type Status =
  | { kind: "live" }
  | { kind: "ended" }
  | { kind: "soon"; label: string }
  | { kind: "later" };

function localMidnight(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function statusOf(start: Date, end: Date, now: Date): Status {
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
 * Calendar-tile date badge for a feed event row: month band, large day
 * number, start time + zone, and a status footer ("Live now", "Today",
 * "Tomorrow", "In N days", "Ended") when one applies. `overlay` pins it to
 * the top-left of the row's hero image; `inline` sits beside the title for
 * an event row without an image.
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
}: {
  startsAt: string;
  endsAt?: string;
  variant: "overlay" | "inline";
}) {
  const hasMounted = useHasMounted();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    // Re-evaluated each minute so "Today" → "Live now" → "Ended" flips
    // without a reload on a feed left open.
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : new Date(start.getTime() + ASSUMED_DURATION_MS);
  const status = hasMounted ? statusOf(start, end, now) : null;
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

  return (
    <div
      role="img"
      aria-label={hasMounted ? `Event ${ended ? "was" : "starts"} ${fullLabel}${statusText ? ` — ${statusText}` : ""}` : "Event date"}
      className={cn(
        "flex w-[4.75rem] flex-shrink-0 flex-col overflow-hidden rounded-lg text-center",
        variant === "overlay"
          ? "absolute left-3 top-3 bg-white text-neutral-900 shadow-lg ring-1 ring-black/10 sm:w-[5.25rem]"
          : "border bg-card text-card-foreground shadow-sm",
      )}
    >
      {hasMounted ? (
        <>
          <div
            className={cn(
              "py-0.5 text-xs font-bold tracking-wider",
              ended ? "bg-neutral-500 text-white" : "bg-primary text-primary-foreground",
            )}
          >
            {month}
          </div>
          <div className={cn("pt-1 text-3xl font-extrabold leading-none sm:text-4xl", ended && "text-neutral-500")}>
            {day}
          </div>
          <div className={cn("mt-1 px-1 text-xs font-semibold leading-tight", ended && "text-neutral-500")}>{time}</div>
          <div className="pb-1 text-[10px] font-medium leading-tight text-neutral-500">{zone}</div>
          {statusText && (
            <div
              className={cn(
                "flex items-center justify-center gap-1 py-0.5 text-[11px] font-bold uppercase leading-tight tracking-wide",
                status?.kind === "live" && "bg-red-600 text-white",
                status?.kind === "ended" && "bg-neutral-200 text-neutral-600",
                status?.kind === "soon" && "bg-amber-100 text-amber-900",
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
