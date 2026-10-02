"use client";

import { useQuery } from "@tanstack/react-query";
import type { ReminderSession } from "@/lib/session-reminders";

const SLOW_REFETCH_MS = 90_000;
const FAST_REFETCH_MS = 30_000;

async function fetchSessions(endpoint: string): Promise<ReminderSession[]> {
  const response = await fetch(endpoint, { cache: "no-store" });
  if (!response.ok) return [];
  const data = (await response.json()) as { sessions: ReminderSession[] };
  return data.sessions;
}

/**
 * Polls a reminder endpoint (member `/api/session-reminders` or public
 * `/api/public-session-reminders`). Polls every 90s normally, but every 30s
 * while any listed session has reached its scheduled start or been started by
 * the host, so "Join now" shows up promptly. react-query pauses interval
 * refetches while the tab is hidden. Shared by the popup and (later) the
 * live-events strip.
 */
export function useReminderSessions(endpoint: string) {
  return useQuery({
    queryKey: ["session-reminders", endpoint],
    queryFn: () => fetchSessions(endpoint),
    refetchInterval: (query) => {
      const sessions = query.state.data;
      const now = Date.now();
      const live = sessions?.some((s) => s.started || Date.parse(s.startsAt) <= now);
      return live ? FAST_REFETCH_MS : SLOW_REFETCH_MS;
    },
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });
}
