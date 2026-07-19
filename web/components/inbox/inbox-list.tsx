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
}: {
  items: InboxListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (items.length === 0) {
    return <p className="p-6 text-center text-sm text-muted-foreground">Nothing here yet.</p>;
  }

  return (
    <ul className="flex flex-col divide-y overflow-y-auto">
      {items.map((item) => {
        const unread = item.kind === "message" && item.unread;
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
                  <span className={cn("truncate text-sm", unread ? "font-bold" : "font-medium")}>
                    {item.otherPartyName}
                  </span>
                  <span className="flex-shrink-0 text-xs text-muted-foreground">
                    {formatRelativeTime(item.lastActivityAt)}
                  </span>
                </div>
                {item.kind === "message" ? (
                  <>
                    {item.subject && (
                      <div className={cn("truncate text-sm", unread ? "font-semibold" : "text-muted-foreground")}>
                        {item.subject}
                      </div>
                    )}
                    <div className="truncate text-xs text-muted-foreground">{item.snippet}</div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                      <CalendarClock className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="truncate">Meeting request: {item.topic}</span>
                    </div>
                    <Badge variant="neutral" className="mt-1">
                      {MEETING_REQUEST_STATUS_LABELS[item.status]}
                    </Badge>
                  </>
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
