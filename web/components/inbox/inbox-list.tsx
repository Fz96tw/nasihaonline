"use client";

import { type InboxListItem } from "@/lib/inbox";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMinutes = Math.round(diffMs / 60_000);
  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

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
    return <p className="p-6 text-center text-sm text-muted-foreground">No messages yet.</p>;
  }

  return (
    <ul className="flex flex-col divide-y overflow-y-auto">
      {items.map((item) => (
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
            <Avatar name={item.otherPartyName} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className={cn("truncate text-sm", item.unread ? "font-bold" : "font-medium")}>
                  {item.otherPartyName}
                </span>
                <span className="flex-shrink-0 text-xs text-muted-foreground">
                  {formatRelativeTime(item.lastActivityAt)}
                </span>
              </div>
              {item.subject && (
                <div className={cn("truncate text-sm", item.unread ? "font-semibold" : "text-muted-foreground")}>
                  {item.subject}
                </div>
              )}
              <div className="truncate text-xs text-muted-foreground">{item.snippet}</div>
            </div>
            {item.unread && <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-primary" />}
          </button>
        </li>
      ))}
    </ul>
  );
}
