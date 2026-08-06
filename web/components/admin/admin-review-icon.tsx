"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const POLL_INTERVAL_MS = 20_000;

async function fetchPendingCount(): Promise<number> {
  const response = await fetch("/api/admin/pending-review-count");
  if (!response.ok) throw new Error("Failed to load pending admin review count");
  const data = await response.json();
  return data.count;
}

/**
 * Nav-bar shield icon for admins: always links to /admin, and badges the
 * total pending-review count across /admin sections (applications, content,
 * ledger, library, conduct, privacy — see lib/admin-review-server.ts) when
 * nonzero. Polls like NotificationBell rather than sharing a
 * socket/subscription.
 */
export function AdminReviewIcon() {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      setCount(await fetchPendingCount());
    } catch {
      // Transient poll failure — next interval tick retries.
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative h-9 w-9 lg:h-10 lg:w-10"
      aria-label="Admin"
      asChild
    >
      <Link href="/admin">
        <Shield className="h-4 w-4 lg:h-[18px] lg:w-[18px]" />
        {count > 0 && (
          <span
            className={cn(
              "absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground",
            )}
          >
            {count > 9 ? "9+" : count}
          </span>
        )}
      </Link>
    </Button>
  );
}
