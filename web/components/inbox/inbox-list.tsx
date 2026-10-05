"use client";

import { CalendarClock } from "lucide-react";
import { type InboxListItem } from "@/lib/inbox";
import { MEETING_REQUEST_STATUS_LABELS } from "@/lib/meeting-requests";
import { formatRelativeTime } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

export function InboxList({
  items,
  selectedId,
  onSelect,
  hasUnfilteredItems = true,
}: {
  items: InboxListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** True if the inbox has items before search/filter is applied — distinguishes an empty inbox from a no-results search. */
  hasUnfilteredItems?: boolean;
}) {
  if (items.length === 0) {
    return (
      <p className="p-6 text-center text-sm text-muted-foreground">
        {hasUnfilteredItems ? "No messages match your search." : "Nothing here yet."}
      </p>
    );
  }

  return (
    <ul className="flex h-full flex-col divide-y overflow-y-auto">
      {items.map((item) => {
        const unread = item.unread;
        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onSelect(item.id)}
              aria-current={selectedId === item.id ? "true" : undefined}
              className={cn(
                "flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-accent/50",
                selectedId === item.id && "bg-accent",
              )}
            >
              <Avatar name={item.otherPartyName} src={item.otherPartyAvatarUrl} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      "flex min-w-0 items-center gap-1.5 text-[15px] text-foreground",
                      unread ? "font-bold" : "font-medium",
                    )}
                  >
                    {item.kind === "meeting_request" && <CalendarClock className="h-3.5 w-3.5 flex-shrink-0" />}
                    <span className="truncate">
                      {item.kind === "message"
                        ? (item.subject ?? item.otherPartyName)
                        : `Meeting request: ${item.topic}`}
                    </span>
                  </span>
                  <span className="flex-shrink-0 text-xs text-muted-foreground">
                    {formatRelativeTime(item.lastActivityAt)}
                  </span>
                </div>
                {item.kind === "message" ? (
                  <div className="truncate text-xs text-muted-foreground">
                    {item.subject && <span className="font-medium">{item.otherPartyName} · </span>}
                    {item.snippet}
                  </div>
                ) : (
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="truncate font-medium">{item.otherPartyName}</span>
                    <Badge variant="neutral">{MEETING_REQUEST_STATUS_LABELS[item.status]}</Badge>
                  </div>
                )}
              </div>
              {unread && <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-primary" />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
