"use client";

import { useCallback, useEffect, useState } from "react";
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
import type { NotificationListItem } from "@/lib/notifications";
import { cn } from "@/lib/utils";

const POLL_INTERVAL_MS = 20_000;

async function fetchNotifications(): Promise<{ items: NotificationListItem[]; unreadCount: number }> {
  const response = await fetch("/api/notifications");
  if (!response.ok) throw new Error("Failed to load notifications");
  return response.json();
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

  const refresh = useCallback(async () => {
    try {
      const data = await fetchNotifications();
      setItems(data.items);
      setUnreadCount(data.unreadCount);
    } catch {
      // Transient poll failure — next interval tick retries.
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  async function handleSelect(notification: NotificationListItem) {
    if (notification.unread) {
      setItems((prev) => prev.map((item) => (item.id === notification.id ? { ...item, unread: false } : item)));
      setUnreadCount((count) => Math.max(0, count - 1));
      await fetch(`/api/notifications/${notification.id}`, { method: "PATCH" }).catch(() => {});
    }
    router.push(notification.link);
  }

  return (
    <DropdownMenu onOpenChange={(open) => open && refresh()}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-[18px] w-[18px]" />
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
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <div className="px-2 py-6 text-center text-sm text-muted-foreground">No notifications yet.</div>
        ) : (
          items.map((notification) => (
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
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
