"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { BellOff, Clock, Video, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  EMPTY_PREFS,
  pickVisibleReminders,
  prefKey,
  snoozeUntil,
  type ReminderPrefs,
  type ReminderSession,
  type ReminderState,
} from "@/lib/session-reminders";

const STORAGE_KEY = "nasiha:session-reminder-prefs";
const REFETCH_MS = 90_000;
const TICK_MS = 15_000;
const MAX_STORED = 200;

function loadPrefs(): ReminderPrefs {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_PREFS;
    const parsed = JSON.parse(raw) as Partial<ReminderPrefs>;
    return { dismissed: parsed.dismissed ?? {}, snoozedUntil: parsed.snoozedUntil ?? {} };
  } catch {
    return EMPTY_PREFS;
  }
}

function savePrefs(prefs: ReminderPrefs) {
  try {
    const dismissed = Object.fromEntries(Object.entries(prefs.dismissed).slice(-MAX_STORED));
    const snoozedUntil = Object.fromEntries(Object.entries(prefs.snoozedUntil).slice(-MAX_STORED));
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ dismissed, snoozedUntil }));
  } catch {
    // Private window / blocked storage — prefs still hold for this page view.
  }
}

async function fetchSessions(): Promise<ReminderSession[]> {
  const response = await fetch("/api/session-reminders", { cache: "no-store" });
  if (!response.ok) return [];
  const data = (await response.json()) as { sessions: ReminderSession[] };
  return data.sessions;
}

function formatStartTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function timingText(session: ReminderSession, state: ReminderState, now: number) {
  const start = Date.parse(session.startsAt);
  if (state === "soon") {
    const minutes = Math.ceil((start - now) / 60_000);
    return `Starts at ${formatStartTime(session.startsAt)} · in ${minutes} min`;
  }
  const minutes = Math.floor((now - start) / 60_000);
  return minutes < 1 ? "Just started" : `Started ${minutes} min ago`;
}

/**
 * Floating "starting soon" / "in progress" reminder with a Join button for
 * the member's events and 1-on-1 meetings. Mounted once in the (member)
 * layout. The two states are dismissed/snoozed independently, so hiding the
 * "starting soon" card never hides the "in progress" one.
 */
export function SessionReminder() {
  const pathname = usePathname();
  const [prefs, setPrefs] = useState<ReminderPrefs>(EMPTY_PREFS);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setPrefs(loadPrefs());
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const { data: sessions } = useQuery({
    queryKey: ["session-reminders"],
    queryFn: fetchSessions,
    refetchInterval: REFETCH_MS,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  const visible = useMemo(
    () => pickVisibleReminders(sessions ?? [], prefs, now),
    [sessions, prefs, now],
  );

  const update = useCallback((change: (prev: ReminderPrefs) => ReminderPrefs) => {
    setPrefs((prev) => {
      const next = change(prev);
      savePrefs(next);
      return next;
    });
  }, []);

  const top = visible[0];
  if (!top || pathname.startsWith("/meet")) return null;

  const { session, state } = top;
  const key = prefKey(session.key, state);
  const live = state === "live";
  const moreCount = visible.length - 1;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={cn(
        "group fixed bottom-4 right-4 z-50 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border shadow-lg",
        "animate-in fade-in slide-in-from-bottom-4 duration-200 motion-reduce:animate-none",
        "transition-colors bg-card/95 supports-[backdrop-filter]:backdrop-blur-md",
        live
          ? "border-primary/50 supports-[backdrop-filter]:bg-card/90"
          : "supports-[backdrop-filter]:bg-card/75",
        "hover:bg-card hover:supports-[backdrop-filter]:bg-card focus-within:bg-card focus-within:supports-[backdrop-filter]:bg-card",
        "max-sm:left-4 max-sm:w-auto",
      )}
    >
      <div className={cn("absolute inset-y-0 left-0 w-1", live ? "bg-primary" : "bg-primary/40")} aria-hidden />
      <div className="flex flex-col gap-3 py-3 pl-5 pr-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p
              className={cn(
                "mb-0.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide",
                live ? "text-primary" : "text-muted-foreground",
              )}
            >
              {live ? (
                <span className="relative flex h-2 w-2" aria-hidden>
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75 motion-reduce:animate-none" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                </span>
              ) : (
                <Clock className="h-3.5 w-3.5" aria-hidden />
              )}
              {live ? "In progress" : "Starting soon"}
            </p>
            <p className="truncate text-sm font-semibold">{session.title}</p>
            <p className="text-xs text-muted-foreground">
              {timingText(session, state, now)}
              {session.detail ? ` · ${session.detail}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              update((prev) => ({ ...prev, dismissed: { ...prev.dismissed, [key]: true } }))
            }
            aria-label={`Dismiss reminder for ${session.title}`}
            title="Dismiss"
            className="-mr-1 -mt-1 flex-shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" asChild>
            <Link href={session.joinHref}>
              <Video className="mr-1.5 h-4 w-4" />
              {live ? "Join now" : "Join session"}
            </Link>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              update((prev) => ({
                ...prev,
                snoozedUntil: { ...prev.snoozedUntil, [key]: snoozeUntil(session, Date.now()) },
              }))
            }
            title="Hide this for 5 minutes"
          >
            <BellOff className="mr-1.5 h-4 w-4" />
            Snooze 5 min
          </Button>
          {moreCount > 0 ? (
            <Link
              href="/calendar"
              className="ml-auto text-xs font-medium text-primary underline-offset-4 hover:underline"
            >
              +{moreCount} more
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
