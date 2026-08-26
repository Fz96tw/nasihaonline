"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

  function handleFilterChange(next: FilterKind) {
    setFilter(next);
    setPage(0);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <CardTitle>Past Meetings</CardTitle>
        <div className="flex items-center gap-1">
          {(["all", "event", "meeting"] as const).map((kind) => (
            <Button
              key={kind}
              type="button"
              size="sm"
              variant={filter === kind ? "secondary" : "outline"}
              onClick={() => handleFilterChange(kind)}
            >
              {FILTER_LABEL[kind]}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {filter === "all" ? "No past meetings yet." : `No past ${FILTER_LABEL[filter].toLowerCase()} yet.`}
          </p>
        ) : (
          <>
            <ul>
              {paged.map((item) => (
                <li
                  key={`${item.kind}-${item.id}`}
                  className="flex flex-col gap-2 border-b py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <Badge variant={item.kind === "event" ? "info" : "neutral"}>
                        {item.kind === "event" ? "Event" : "1:1 Meeting"}
                      </Badge>
                      {item.eventType ? <Badge variant="neutral">{EVENT_TYPE_LABELS[item.eventType]}</Badge> : null}
                      {item.hasRecording ? <Badge variant="success">Recording available</Badge> : null}
                    </div>
                    <Link href={item.detailHref} className="block truncate font-medium hover:underline">
                      {item.title}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(item.startsAt)} · Hosted by {item.organizerName}
                    </p>
                  </div>
                  {item.hasRecording && item.recordingWatchHref ? (
                    <Button asChild size="sm" variant="outline" className="flex-shrink-0">
                      <a href={item.recordingWatchHref} target="_blank" rel="noopener noreferrer">
                        Watch recording
                      </a>
                    </Button>
                  ) : null}
                </li>
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
      </CardContent>
    </Card>
  );
}
