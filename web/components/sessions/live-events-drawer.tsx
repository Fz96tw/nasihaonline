"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { BellOff, Clock } from "lucide-react";
import { SessionAction } from "@/components/sessions/session-action";
import { Button } from "@/components/ui/button";
import { useIsPhone } from "@/hooks/use-is-phone";
import { useReminderSessions } from "@/hooks/use-reminder-sessions";
import { isPrimaryActionTarget, trackNotice, trackNoticeShown } from "@/lib/analytics";
import { publicTimingText, timingText } from "@/lib/reminder-text";
import {
  compareReminders,
  publicReminderStateOf,
  reminderPrefKey,
  reminderStateOf,
  snoozeUntil,
  type PublicReminderState,
  type ReminderSession,
  type ReminderState,
} from "@/lib/session-reminders";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "nasiha:live-drawer-prefs";
const PUBLIC_ENDPOINT = "/api/public-session-reminders";
const MEMBER_ENDPOINT = "/api/session-reminders";
const TICK_MS = 15_000;
const MAX_STORED = 200;
const SWIPE_PX = 36;
/** Collapsed height: a 12px handle row + a 48px row, so the 36px primary button has 6px of air above and below. */
const PEEK_HEIGHT = "calc(60px + env(safe-area-inset-bottom, 0px))";

type Prefs = {
  /** Notice keys (reminderPrefKey) that have already auto-expanded once — they start collapsed from then on. */
  seen: Record<string, true>;
  /** Notice key -> epoch ms a "Snooze 5 min" lasts. */
  snoozedUntil: Record<string, number>;
};
const EMPTY: Prefs = { seen: {}, snoozedUntil: {} };

function loadPrefs(): Prefs {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return { seen: parsed.seen ?? {}, snoozedUntil: parsed.snoozedUntil ?? {} };
  } catch {
    return EMPTY;
  }
}

function savePrefs(prefs: Prefs) {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        seen: Object.fromEntries(Object.entries(prefs.seen).slice(-MAX_STORED)),
        snoozedUntil: Object.fromEntries(Object.entries(prefs.snoozedUntil).slice(-MAX_STORED)),
      }),
    );
  } catch {
    // Private window / blocked storage — prefs still hold for this page view.
  }
}

type Item = { session: ReminderSession; state: string };

const HEADINGS: Record<string, string> = {
  soon: "Starting soon",
  waiting: "Waiting for host",
  started: "Live now",
  live: "In progress",
};
/** One-word versions for the collapsed peek bar, where the title needs the width. */
const SHORT_HEADINGS: Record<string, string> = { soon: "Soon", waiting: "Waiting", started: "Live", live: "Live" };

function isLiveState(state: string) {
  return state === "started" || state === "live";
}

/**
 * Phone replacement for BOTH the floating popup and the top live-events
 * strip: a translucent (frosted) bottom drawer that collapses to a ~48px peek
 * bar and never fully goes away while something is upcoming or live. The peek
 * bar shows the MOST RELEVANT notice (a started meeting, then ones you're
 * committed to, then the soonest) with a "+N" count; expanded lists every one
 * in a scroll area. It slides up to its expanded view the first time a new state appears (starting soon,
 * live) and stays collapsed after that — collapsing is "dismiss without
 * losing it", so the event is always one tap away. Renders only on phones
 * (useIsPhone); on desktop the popup + top strip are used instead.
 *
 * `audience="auto"` (marketing pages) picks visitor vs member from Clerk's
 * client state; `"member"` is for the signed-in app header.
 */
export function LiveEventsDrawer({ audience = "auto" }: { audience?: "auto" | "member" }) {
  const isPhone = useIsPhone();
  const pathname = usePathname();
  const { isLoaded, isSignedIn } = useAuth();
  const isMember = audience === "member" || (isLoaded && Boolean(isSignedIn));
  const isPublic = audience === "auto" && isLoaded && !isSignedIn;
  const kind: "public" | "member" = isMember ? "member" : "public";
  const endpoint = isMember ? MEMBER_ENDPOINT : isPublic ? PUBLIC_ENDPOINT : null;
  const onMeetingScreen = pathname.startsWith("/meet");

  const { data: sessions } = useReminderSessions(isPhone && !onMeetingScreen ? endpoint : null);
  const [now, setNow] = useState(() => Date.now());
  const [prefs, setPrefs] = useState<Prefs>(EMPTY);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [typing, setTyping] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const lastTopKey = useRef<string | null>(null);
  const swipeStart = useRef<number | null>(null);
  const swiped = useRef(false);

  useEffect(() => {
    setPrefs(loadPrefs());
    setPrefsLoaded(true);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  // Hide while a text field is focused (the soft keyboard needs the room). Hidden
  // with CSS, not unmounted, so a Register dialog opened from the drawer survives.
  useEffect(() => {
    const isField = (el: EventTarget | null) =>
      el instanceof HTMLElement && (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.isContentEditable);
    const onIn = (e: FocusEvent) => setTyping(isField(e.target));
    const onOut = () => setTyping(false);
    document.addEventListener("focusin", onIn);
    document.addEventListener("focusout", onOut);
    return () => {
      document.removeEventListener("focusin", onIn);
      document.removeEventListener("focusout", onOut);
    };
  }, []);

  const items: Item[] = useMemo(() => {
    if (!isPhone || onMeetingScreen) return [];
    return (sessions ?? [])
      .flatMap((session): Item[] => {
        const state: string | null = isMember ? reminderStateOf(session, now) : publicReminderStateOf(session, now);
        if (!state) return [];
        if ((prefs.snoozedUntil[reminderPrefKey(session, state)] ?? 0) > now) return [];
        return [{ session, state }];
      })
      .sort(compareReminders);
  }, [isPhone, onMeetingScreen, sessions, isMember, now, prefs.snoozedUntil]);

  const top = items[0];
  const topKey = top ? reminderPrefKey(top.session, top.state) : null;

  const update = useCallback((change: (prev: Prefs) => Prefs) => {
    setPrefs((prev) => {
      const next = change(prev);
      savePrefs(next);
      return next;
    });
  }, []);

  // Auto-expand the first time a new state appears; start collapsed if this
  // browser has already shown it expanded once (or the user collapsed it).
  useEffect(() => {
    if (!prefsLoaded) return;
    if (!topKey || !top) {
      lastTopKey.current = null;
      setExpanded(false);
      return;
    }
    if (lastTopKey.current === topKey) return;
    lastTopKey.current = topKey;
    const firstTime = !prefs.seen[topKey];
    setExpanded(firstTime);
    if (firstTime) update((prev) => ({ ...prev, seen: { ...prev.seen, [topKey]: true } }));
    setAnnouncement(`${HEADINGS[top.state] ?? "Live event"}: ${top.session.title}`);
    trackNoticeShown("drawer", topKey, top.state, "phone");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to a new top notice
  }, [prefsLoaded, topKey]);

  // The visible height while collapsed (peek bar + safe area), so pages get
  // matching bottom padding and the footer / last content is never hidden.
  const visible = items.length > 0;
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    if (visible) {
      root.style.setProperty("--live-drawer-height", PEEK_HEIGHT);
      body.style.paddingBottom = PEEK_HEIGHT;
    }
    return () => {
      root.style.setProperty("--live-drawer-height", "0px");
      body.style.paddingBottom = "";
    };
  }, [visible]);

  if (!isPhone || !visible || !top) return null;

  const topLive = isLiveState(top.state);

  const collapse = () => {
    setExpanded(false);
    trackNotice("collapse", "drawer", top.state, "phone");
  };
  const toggle = () => {
    if (swiped.current) return;
    if (expanded) collapse();
    else setExpanded(true);
  };
  // Swipe: a vertical drag of >= SWIPE_PX on the handle / peek bar expands (up) or collapses (down).
  const onPointerDown = (e: React.PointerEvent) => {
    // A press on a button/link INSIDE the row (the primary action) is a tap on
    // that control, not the start of a swipe — and capturing the pointer would
    // retarget its click. The handle button itself (currentTarget) is fine.
    const control = (e.target as HTMLElement).closest("button, a");
    if (control && control !== e.currentTarget) {
      swipeStart.current = null;
      return;
    }
    swipeStart.current = e.clientY;
    swiped.current = false;
    // Without capture a mouse drag that ends outside this element never delivers
    // pointerup to it (touch has implicit capture); keeps both behaving the same.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Not capturable (e.g. synthetic event) — the swipe just won't register.
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (swipeStart.current === null) return;
    const dy = e.clientY - swipeStart.current;
    swipeStart.current = null;
    if (Math.abs(dy) < SWIPE_PX) return;
    swiped.current = true;
    window.setTimeout(() => (swiped.current = false), 0);
    if (dy < 0 && !expanded) setExpanded(true);
    if (dy > 0 && expanded) collapse();
  };

  return (
    <section
      role="region"
      aria-label="Live events"
      aria-hidden={typing || undefined}
      onClickCapture={(event) => {
        if (isPrimaryActionTarget(event.target)) trackNotice("click", "drawer", top.state, "phone");
      }}
      className={cn(
        // z-40: above page content, below Radix dialogs (z-50) so the Register dialog opened from here stacks on top.
        "fixed inset-x-0 bottom-0 z-40 rounded-t-2xl border border-b-0 shadow-[0_-8px_28px_-10px_rgba(0,0,0,0.35)]",
        // Translucent / frosted: a semi-transparent card colour over a blur of the page behind it.
        "bg-card/95 supports-[backdrop-filter]:bg-card/70 supports-[backdrop-filter]:backdrop-blur-xl",
        "pb-[env(safe-area-inset-bottom,0px)] transition-transform duration-300 ease-out motion-reduce:transition-none",
        topLive && "border-primary/40",
        typing && "translate-y-full",
      )}
    >
      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>

      <button
        type="button"
        data-live-secondary
        aria-expanded={expanded}
        aria-label={expanded ? "Collapse live events" : "Expand live events"}
        onClick={toggle}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        className="flex h-3 w-full touch-none items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="h-1 w-10 rounded-full bg-muted-foreground/40" aria-hidden />
      </button>

      {expanded ? (
        // Every notice, in relevance order, in a scroll area capped at 60% of the
        // viewport (so a short landscape phone can still see the page behind it).
        <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto overscroll-contain px-4 pb-3 pt-2">
          {items.map(({ session, state }, index) => {
            const key = reminderPrefKey(session, state);
            const live = isLiveState(state);
            const timing = isMember
              ? timingText(session, state as ReminderState, now)
              : publicTimingText(session, state as PublicReminderState, now);
            return (
              <div key={session.key} className={cn("flex flex-col gap-2", index > 0 && "border-t pt-3")}>
                <p
                  className={cn(
                    "flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide",
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
                  {HEADINGS[state] ?? "Live event"}
                </p>
                <div>
                  <p className="truncate text-base font-semibold">{session.title}</p>
                  <p className="text-xs text-muted-foreground">{timing}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <SessionAction session={session} state={state} audience={kind} />
                  <Button
                    size="sm"
                    variant="ghost"
                    data-live-secondary
                    title="Hide this for 5 minutes"
                    onClick={() => {
                      trackNotice("dismiss", "drawer", state, "phone");
                      update((prev) => ({
                        ...prev,
                        snoozedUntil: { ...prev.snoozedUntil, [key]: snoozeUntil(session, Date.now()) },
                      }));
                    }}
                  >
                    <BellOff className="mr-1.5 h-4 w-4" aria-hidden />
                    Snooze 5 min
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        // Collapsed peek bar: the whole row is tappable (expands); the primary button inside works on its own.
        <div
          className="flex h-12 items-center gap-2 px-4 text-sm"
          onClick={(e) => {
            if (!(e.target as HTMLElement).closest("button, a")) toggle();
          }}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
        >
          {topLive ? (
            <span className="relative flex h-2 w-2 flex-shrink-0" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75 motion-reduce:animate-none" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
          ) : (
            <Clock className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" aria-hidden />
          )}
          <span className="min-w-0 flex-1 truncate">
            <span className={cn("font-semibold", topLive && "text-primary")}>{SHORT_HEADINGS[top.state] ?? "Live"}</span>
            <span className="text-muted-foreground"> · </span>
            <span>{top.session.title}</span>
          </span>
          {items.length > 1 ? (
            // A visible count of what's behind the bar (tapping the bar expands it).
            <span
              className="flex-shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-xs font-semibold text-primary"
              aria-label={`${items.length - 1} more`}
            >
              +{items.length - 1}
            </span>
          ) : null}
          <span className="flex-shrink-0">
            <SessionAction session={top.session} state={top.state} audience={kind} compact />
          </span>
        </div>
      )}
    </section>
  );
}
