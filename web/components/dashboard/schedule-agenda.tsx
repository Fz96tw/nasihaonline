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

function formatTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { hour: "numeric", minute: "2-digit" });
}

function formatDateHeading(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return "Today";
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (date.toDateString() === tomorrow.toDateString()) return "Tomorrow";
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/**
 * Formats and groups schedule items by local date in the browser — this must
 * run client-side because the server process's timezone (UTC) isn't the
 * visitor's local timezone.
 */
export function ScheduleAgenda({ items }: { items: ScheduleItem[] }) {
  const groups: { heading: string; items: ScheduleItem[] }[] = [];
  for (const item of items) {
    const heading = formatDateHeading(item.dateTime);
    const lastGroup = groups[groups.length - 1];
    if (lastGroup?.heading === heading) {
      lastGroup.items.push(item);
    } else {
      groups.push({ heading, items: [item] });
    }
  }

  if (groups.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing on your schedule right now. Check the calendar for what&apos;s coming up.
      </p>
    );
  }

  return (
    <div className="flex flex-col divide-y divide-border">
      {groups.map((group) => (
        <div key={group.heading} className="pb-4 pt-4 first:pt-0 last:pb-0">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {group.heading}
          </p>
          <ul className="flex flex-col gap-3">
            {group.items.map((item) => (
              <li
                key={item.id}
                className="flex items-start justify-between gap-2 border-b pb-3 last:border-b-0 last:pb-0"
              >
                <div className="min-w-0">
                  <Link href={item.href} className="block truncate text-sm font-medium hover:underline">
                    {item.title}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {formatTime(item.dateTime)}
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
