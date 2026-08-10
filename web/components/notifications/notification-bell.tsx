"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getCsrfToken } from "@/lib/csrf-client";
import type { NotificationListItem } from "@/lib/notifications";
import { cn } from "@/lib/utils";

const POLL_INTERVAL_MS = 20_000;

async function fetchNotifications(
  signal: AbortSignal,
): Promise<{ items: NotificationListItem[]; unreadCount: number }> {
  const response = await fetch("/api/notifications", { signal });
  if (!response.ok) throw new Error("Failed to load notifications");
  return response.json();
}

async function markRead(id: string): Promise<void> {
  const csrfToken = await getCsrfToken();
  const response = await fetch(`/api/notifications/${id}`, {
    method: "PATCH",
    headers: { "x-csrf-token": csrfToken },
  });
  if (!response.ok) throw new Error("Failed to mark notification read");
}

async function markAllRead(): Promise<void> {
  const csrfToken = await getCsrfToken();
  const response = await fetch("/api/notifications/read-all", {
    method: "POST",
    headers: { "x-csrf-token": csrfToken },
  });
  if (!response.ok) throw new Error("Failed to mark all notifications read");
}

async function clearRead(): Promise<void> {
  const csrfToken = await getCsrfToken();
  const response = await fetch("/api/notifications/clear-read", {
    method: "DELETE",
    headers: { "x-csrf-token": csrfToken },
  });
  if (!response.ok) throw new Error("Failed to clear read notifications");
}

/**
 * Homegrown in-app notification bell (§4.10, §8 — request/response polling,
 * no socket). Self-contained (fetch + setInterval) rather than react-query:
 * SiteHeader renders outside the `(member)`-only QueryProvider.
 */
export function NotificationBell() {
  const router = useRouter();
  const [items, setItems] = useState<NotificationListItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  // setInterval fires on schedule regardless of whether the previous
  // refresh() resolved. Without cancelling the stale request first, a slow
  // response lets ticks pile up as separate in-flight fetches, which can
  // exhaust the browser's per-origin connection cap and stall unrelated
  // navigation (Link clicks) queued behind them.
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const data = await fetchNotifications(controller.signal);
      setItems(data.items);
      setUnreadCount(data.unreadCount);
    } catch {
      // Transient poll failure (including our own abort) — next interval tick retries.
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      clearInterval(interval);
      abortRef.current?.abort();
    };
  }, [refresh]);

  async function handleSelect(notification: NotificationListItem) {
    if (notification.unread) {
      setItems((prev) => prev.map((item) => (item.id === notification.id ? { ...item, unread: false } : item)));
      setUnreadCount((count) => Math.max(0, count - 1));
      try {
        await markRead(notification.id);
      } catch {
        // Resync with the server rather than leaving the badge permanently wrong.
        await refresh();
      }
    }
    if (notification.link) router.push(notification.link);
  }

  async function handleMarkAllRead() {
    const previousItems = items;
    const previousUnreadCount = unreadCount;
    setItems((prev) => prev.map((item) => ({ ...item, unread: false })));
    setUnreadCount(0);
    try {
      await markAllRead();
    } catch {
      setItems(previousItems);
      setUnreadCount(previousUnreadCount);
    }
  }

  async function handleClearRead() {
    const previousItems = items;
    setItems((prev) => prev.filter((item) => item.unread));
    try {
      await clearRead();
    } catch {
      setItems(previousItems);
    }
  }

  return (
    <DropdownMenu onOpenChange={(open) => open && refresh()}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9 lg:h-10 lg:w-10" aria-label="Notifications">
          <Bell className="h-4 w-4 lg:h-[18px] lg:w-[18px]" />
          {unreadCount > 0 ? (
            <span
              className={cn(
                "absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground",
              )}
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between gap-2 px-2 py-1.5">
          <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
          <div className="flex items-center gap-2">
            {items.some((item) => !item.unread) ? (
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  handleClearRead();
                }}
                className="text-xs font-medium text-muted-foreground hover:underline"
              >
                Clear read
              </button>
            ) : null}
            {unreadCount > 0 ? (
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  handleMarkAllRead();
                }}
                className="text-xs font-medium text-primary hover:underline"
              >
                Mark all read
              </button>
            ) : null}
          </div>
        </div>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <div className="px-2 py-6 text-center text-sm text-muted-foreground">No notifications yet.</div>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {items.map((notification) => (
              <DropdownMenuItem
                key={notification.id}
                onSelect={() => handleSelect(notification)}
                className="flex flex-col items-start gap-0.5 whitespace-normal py-2"
              >
                <span className={cn("text-sm", notification.unread ? "font-semibold" : "text-muted-foreground")}>
                  {notification.message}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(notification.createdAt).toLocaleString()}
                </span>
              </DropdownMenuItem>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
