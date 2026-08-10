"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const POLL_INTERVAL_MS = 120_000;

async function fetchPendingCount(signal: AbortSignal): Promise<number> {
  const response = await fetch("/api/admin/pending-review-count", { signal });
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
  // setInterval fires on schedule regardless of whether the previous
  // refresh() resolved. Without cancelling the stale request first, a slow
  // response (DB contention, etc) lets ticks pile up as separate in-flight
  // fetches, which can exhaust the browser's per-origin connection cap and
  // stall unrelated navigation (Link clicks) queued behind them.
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      setCount(await fetchPendingCount(controller.signal));
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
