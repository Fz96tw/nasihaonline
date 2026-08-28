"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type ScheduleItem = {
  id: string;
  title: string;
  dateTime: string;
  href: string;
  detail?: string;
  badge: { label: string; variant: "success" | "warning" | "info" } | null;
  /** Direct join link (Google Meet, etc). Null when not yet available — event needs an RSVP, meeting isn't accepted, or no link was set. */
  joinUrl: string | null;
  joinLabel: string;
};

type ScheduleBucket = "today" | "thisWeek" | "later";

function startOfLocalDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Bucketing must run client-side because the server process's timezone
 * (UTC) isn't the visitor's local timezone. Mirrors the past-attendance
 * widget's recencyBucketOf, pointed the other direction: "This Week" runs
 * through the end of the current local calendar week (Saturday, JS's own
 * Date.getDay() convention); everything from next Sunday on is "Next Week
 * and Later".
 */
function scheduleBucketOf(iso: string): ScheduleBucket {
  const today = startOfLocalDay(new Date());
  const date = startOfLocalDay(new Date(iso));
  if (date.getTime() === today.getTime()) return "today";
  const startOfNextWeek = new Date(today);
  startOfNextWeek.setDate(startOfNextWeek.getDate() + (7 - today.getDay()));
  if (date.getTime() < startOfNextWeek.getTime()) return "thisWeek";
  return "later";
}

const SCHEDULE_BUCKETS: { key: ScheduleBucket; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "thisWeek", label: "This Week" },
  { key: "later", label: "Next Week and Later" },
];

function formatTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** Today's items need only a time — the group heading already says "Today". Anything in a multi-day bucket needs its own date too, since the heading no longer pins it to one day. */
function formatWhen(iso: string, bucket: ScheduleBucket) {
  const time = formatTime(iso);
  if (bucket === "today") return time;
  const datePart = new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return `${datePart} · ${time}`;
}

export function ScheduleAgenda({ items }: { items: ScheduleItem[] }) {
  const groups = SCHEDULE_BUCKETS.map((bucket) => ({
    bucket,
    items: items.filter((item) => scheduleBucketOf(item.dateTime) === bucket.key),
  })).filter((group) => group.items.length > 0);

  if (groups.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing on your schedule right now. Check the calendar for what&apos;s coming up.
      </p>
    );
  }

  return (
    <div className="flex flex-col divide-y divide-border">
      {groups.map(({ bucket, items: groupItems }) => (
        <div key={bucket.key} className="pb-4 pt-4 first:pt-0 last:pb-0">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{bucket.label}</p>
          <ul className="flex flex-col gap-3">
            {groupItems.map((item) => (
              <li
                key={item.id}
                className="flex items-start justify-between gap-2 border-b pb-3 last:border-b-0 last:pb-0"
              >
                <div className="min-w-0">
                  <Link href={item.href} className="block truncate text-sm font-medium hover:underline">
                    {item.title}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {formatWhen(item.dateTime, bucket.key)}
                    {item.detail ? ` · ${item.detail}` : ""}
                  </p>
                  {item.joinUrl ? (
                    <a
                      href={item.joinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      {item.joinLabel}
                      <ArrowRight className="h-3 w-3" />
                    </a>
                  ) : null}
                </div>
                {item.badge ? (
                  <Badge variant={item.badge.variant} className="flex-shrink-0">
                    {item.badge.label}
                  </Badge>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
