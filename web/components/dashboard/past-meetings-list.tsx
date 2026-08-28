"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EVENT_TYPE_LABELS } from "@/lib/events";
import type { AttendanceHistoryItem } from "@/lib/attendance-history";

const PAGE_SIZE = 6;
type FilterKind = "all" | "event" | "meeting";

const FILTER_LABEL: Record<FilterKind, string> = {
  all: "All",
  event: "Events",
  meeting: "1:1 Meetings",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

type RecencyBucket = "yesterday" | "thisWeek" | "older";

function startOfLocalDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Local-date bucketing — must run client-side since the server's timezone
 * (UTC) isn't the visitor's, same rationale as ScheduleAgenda's
 * scheduleBucketOf. "Yesterday" is deliberate, not "today": an event/meeting
 * from earlier today that already ended still appears in Your Schedule's own
 * "Today" group (both getDashboardUpcomingEvents and getUpcomingMeetingsForUser
 * filter by start-of-day, not `now`), so grouping today's past items under a
 * second "Today" heading here would just duplicate that label for the same
 * item across two widgets. "This week" runs from the most recent Sunday
 * (local calendar week, JS's own Date.getDay() convention) through two days
 * ago — everything before that calendar week is "Last week and older".
 */
function recencyBucketOf(iso: string): RecencyBucket {
  const today = startOfLocalDay(new Date());
  const date = startOfLocalDay(new Date(iso));

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.getTime() === yesterday.getTime()) return "yesterday";

  const startOfThisWeek = new Date(today);
  startOfThisWeek.setDate(startOfThisWeek.getDate() - today.getDay());
  if (date.getTime() >= startOfThisWeek.getTime()) return "thisWeek";

  return "older";
}

const RECENCY_BUCKETS: { key: RecencyBucket; label: string }[] = [
  { key: "yesterday", label: "Yesterday" },
  { key: "thisWeek", label: "This Week" },
  { key: "older", label: "Last Week and Older" },
];

function PastMeetingRow({ item }: { item: AttendanceHistoryItem }) {
  return (
    <li className="flex items-start justify-between gap-3 border-b py-4 last:border-b-0">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">
          {formatDate(item.startsAt)} · Hosted by {item.organizerName}
        </p>
        <Link href={item.detailHref} className="block truncate text-sm font-medium hover:underline">
          {item.title}
        </Link>
        {item.hasRecording && item.recordingPartCount > 1 ? (
          <Link
            href={item.detailHref}
            className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Watch multi-part recording
            <ArrowRight className="h-3 w-3" />
          </Link>
        ) : item.hasRecording && item.recordingWatchHref ? (
          <a
            href={item.recordingWatchHref}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Watch recording
            <ArrowRight className="h-3 w-3" />
          </a>
        ) : null}
      </div>
      <div className="flex flex-shrink-0 flex-col items-end gap-1">
        <Badge variant={item.kind === "event" ? "info" : "neutral"}>
          {item.kind === "event" ? "Event" : "1:1 Meeting"}
        </Badge>
        {item.eventType ? <Badge variant="neutral">{EVENT_TYPE_LABELS[item.eventType]}</Badge> : null}
        {item.recordingPartCount > 1 ? <Badge variant="neutral">{item.recordingPartCount} parts</Badge> : null}
      </div>
    </li>
  );
}

export function PastMeetingsList({ items }: { items: AttendanceHistoryItem[] }) {
  const [filter, setFilter] = useState<FilterKind>("all");
  const [page, setPage] = useState(0);

  const filtered = useMemo(
    () => (filter === "all" ? items : items.filter((item) => item.kind === filter)),
    [items, filter],
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const paged = filtered.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);
  // Grouped the same way Your Schedule buckets upcoming items (Today/This
  // Week/Next Week and Later) — see recencyBucketOf's comment for why this
  // starts at "Yesterday" rather than "Today". Within each bucket, items stay
  // in the already-sorted date-descending order; each row also carries its
  // own date as its first line, so there's no need for a heading per
  // individual day.
  const recencyGroups = RECENCY_BUCKETS.map((bucket) => ({
    bucket,
    items: paged.filter((item) => recencyBucketOf(item.startsAt) === bucket.key),
  })).filter((group) => group.items.length > 0);

  function handleFilterChange(next: FilterKind) {
    setFilter(next);
    setPage(0);
  }

  return (
    <div>
      <div className="mb-4 flex flex-row flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold leading-none tracking-tight">Attendance History</h3>
        <Tabs value={filter} onValueChange={(value) => handleFilterChange(value as FilterKind)}>
          <TabsList>
            {(["all", "event", "meeting"] as const).map((kind) => (
              <TabsTrigger key={kind} value={kind}>
                {FILTER_LABEL[kind]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      <div>
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {filter === "all" ? "No attendance history yet." : `No past ${FILTER_LABEL[filter].toLowerCase()} yet.`}
          </p>
        ) : (
          <>
            {recencyGroups.map(({ bucket, items: groupItems }) => (
              <div key={bucket.key} className="mb-1 last:mb-0">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {bucket.label}
                </p>
                <ul>
                  {groupItems.map((item) => (
                    <PastMeetingRow key={`${item.kind}-${item.id}`} item={item} />
                  ))}
                </ul>
              </div>
            ))}
            {pageCount > 1 ? (
              <div className="mt-4 flex items-center justify-between">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={currentPage === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {currentPage + 1} of {pageCount}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= pageCount - 1}
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                >
                  Next
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
