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

/**
 * Local-date comparison — must run client-side since the server's timezone
 * (UTC) isn't the visitor's, same rationale as ScheduleAgenda's
 * formatDateHeading. Deliberately "yesterday", not "today": an event/meeting
 * from earlier today that already ended still appears in Your Schedule's own
 * "Today" group (both getDashboardUpcomingEvents and getUpcomingMeetingsForUser
 * filter by start-of-day, not `now`), so grouping today's past items under a
 * second "Today" heading here would just duplicate that label for the same
 * item across two widgets.
 */
function isYesterday(iso: string) {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return new Date(iso).toDateString() === yesterday.toDateString();
}

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
  // Yesterday gets its own heading, same convention as ScheduleAgenda's
  // upcoming list (which uses "Today"/"Tomorrow") — see isYesterday's comment
  // for why this list starts one day later than that one. Everything else
  // (today's already-ended items, or anything older) is just one flat list
  // in date order below it — each row already carries its own date as its
  // first line, so a per-day heading for older rows would be redundant.
  const yesterdayItems = paged.filter((item) => isYesterday(item.startsAt));
  const otherItems = paged.filter((item) => !isYesterday(item.startsAt));

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
            {yesterdayItems.length > 0 ? (
              <div className="mb-1">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Yesterday</p>
                <ul>
                  {yesterdayItems.map((item) => (
                    <PastMeetingRow key={`${item.kind}-${item.id}`} item={item} />
                  ))}
                </ul>
              </div>
            ) : null}
            <ul>
              {otherItems.map((item) => (
                <PastMeetingRow key={`${item.kind}-${item.id}`} item={item} />
              ))}
            </ul>
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
