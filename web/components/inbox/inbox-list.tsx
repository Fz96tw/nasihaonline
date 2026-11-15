"use client";

import { CalendarClock, Users } from "lucide-react";
import { type GroupMessageParticipant, type InboxListItem } from "@/lib/inbox";
import { MEETING_REQUEST_STATUS_LABELS } from "@/lib/meeting-requests";
import { formatRelativeTime } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

/** Up to three overlapping avatars for a group message row (§4.7), the viewer left out. */
export function GroupAvatars({
  participants,
  currentUserId,
  size = "sm",
}: {
  participants: GroupMessageParticipant[];
  currentUserId: string;
  size?: "xs" | "sm";
}) {
  const others = participants.filter((participant) => participant.id !== currentUserId).slice(0, 3);
  return (
    <span className={cn("relative flex flex-shrink-0", size === "sm" ? "h-8 w-10" : "h-7 w-8")} aria-hidden="true">
      {others.map((participant, index) => (
        <span
          key={participant.id}
          className="absolute rounded-full ring-2 ring-background"
          style={{ left: `${index * (size === "sm" ? 7 : 4)}px`, top: `${index * (size === "sm" ? 4 : 2)}px`, zIndex: 3 - index }}
        >
          <Avatar name={participant.name} src={participant.avatarUrl} size="xs" />
        </span>
      ))}
    </span>
  );
}

export function InboxList({
  items,
  selectedId,
  onSelect,
  currentUserId,
  hasUnfilteredItems = true,
}: {
  items: InboxListItem[];
  currentUserId: string;
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
              {item.kind === "group_message" ? (
                <GroupAvatars participants={item.participants} currentUserId={currentUserId} />
              ) : (
                <Avatar name={item.otherPartyName} src={item.otherPartyAvatarUrl} size="sm" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      "flex min-w-0 items-center gap-1.5 text-[15px] text-foreground",
                      unread ? "font-bold" : "font-medium",
                    )}
                  >
                    {item.kind === "meeting_request" && <CalendarClock className="h-3.5 w-3.5 flex-shrink-0" />}
                    {item.kind === "group_message" && (
                      <Users className="h-3.5 w-3.5 flex-shrink-0" aria-label="Group message" />
                    )}
                    <span className="truncate">
                      {item.kind === "message"
                        ? (item.subject ?? item.otherPartyName)
                        : item.kind === "group_message"
                          ? item.subject
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
                ) : item.kind === "group_message" ? (
                  <div className="flex flex-col text-xs text-muted-foreground">
                    <span className="truncate font-medium">{item.otherPartyName}</span>
                    <span className="truncate">{item.snippet}</span>
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
