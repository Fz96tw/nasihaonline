"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BellOff, Clock, Video, X } from "lucide-react";
import { RegisterButton } from "@/components/events/register-button";
import { MemberJoinButton, MemberRsvpButton } from "@/components/sessions/member-join-button";
import { Button } from "@/components/ui/button";
import { useIsPhone } from "@/hooks/use-is-phone";
import { useReminderSessions } from "@/hooks/use-reminder-sessions";
import { isPrimaryActionTarget, trackNotice, trackNoticeShown } from "@/lib/analytics";
import { publicTimingText, timingText } from "@/lib/reminder-text";
import { cn } from "@/lib/utils";
import {
  EMPTY_PREFS,
  pickVisiblePublicReminders,
  pickVisibleReminders,
  reminderPrefKey,
  snoozeUntil,
  type PublicReminderState,
  type ReminderPrefs,
  type ReminderSession,
  type ReminderState,
} from "@/lib/session-reminders";

const DEFAULT_STORAGE_KEY = "nasiha:session-reminder-prefs";
const TICK_MS = 15_000;
const MAX_STORED = 200;

function loadPrefs(storageKey: string): ReminderPrefs {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return EMPTY_PREFS;
    const parsed = JSON.parse(raw) as Partial<ReminderPrefs>;
    return { dismissed: parsed.dismissed ?? {}, snoozedUntil: parsed.snoozedUntil ?? {} };
  } catch {
    return EMPTY_PREFS;
  }
}

function savePrefs(storageKey: string, prefs: ReminderPrefs) {
  try {
    const dismissed = Object.fromEntries(Object.entries(prefs.dismissed).slice(-MAX_STORED));
    const snoozedUntil = Object.fromEntries(Object.entries(prefs.snoozedUntil).slice(-MAX_STORED));
    window.localStorage.setItem(storageKey, JSON.stringify({ dismissed, snoozedUntil }));
  } catch {
    // Private window / blocked storage — prefs still hold for this page view.
  }
}

/**
 * Floating "starting soon" / "in progress" reminder with a Join button for
 * the member's events and 1-on-1 meetings. Mounted once in the (member)
 * layout. The two states are dismissed/snoozed independently, so hiding the
 * "starting soon" card never hides the "in progress" one.
 */
export function SessionReminder({
  variant = "member",
  endpoint = variant === "public" ? "/api/public-session-reminders" : "/api/session-reminders",
  storageKey = DEFAULT_STORAGE_KEY,
  moreHref = variant === "public" ? "/events" : "/calendar",
}: {
  /** "public" is the signed-out popup: three states (soon / waiting for host / started) and links to the public event page. */
  variant?: "member" | "public";
  endpoint?: string;
  storageKey?: string;
  moreHref?: string;
} = {}) {
  const pathname = usePathname();
  // On phones the live-events drawer (live-events-drawer.tsx) replaces this card.
  const isPhone = useIsPhone();
  const [prefs, setPrefs] = useState<ReminderPrefs>(EMPTY_PREFS);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setPrefs(loadPrefs(storageKey));
  }, [storageKey]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const { data: sessions } = useReminderSessions(isPhone ? null : endpoint);

  const visible = useMemo(() => {
    const picked: { session: ReminderSession; state: string }[] =
      variant === "public"
        ? pickVisiblePublicReminders(sessions ?? [], prefs, now)
        : pickVisibleReminders(sessions ?? [], prefs, now);
    // The popup interrupts for "starting soon" — and, for the member's own
    // committed events, when they're in progress. For everyone else (signed-out
    // visitors; a member's visible-but-not-RSVP'd events) "live now" belongs
    // to the top strip, so the popup doesn't repeat it.
    return picked.filter(({ session, state }) => (variant === "public" || session.rsvped === false ? state === "soon" : true));
  }, [variant, sessions, prefs, now]);

  const update = useCallback((change: (prev: ReminderPrefs) => ReminderPrefs) => {
    setPrefs((prev) => {
      const next = change(prev);
      savePrefs(storageKey, next);
      return next;
    });
  }, [storageKey]);

  const top = visible[0];
  const hidden = isPhone || pathname.startsWith("/meet");
  const topKey = top ? reminderPrefKey(top.session, top.state) : null;
  useEffect(() => {
    if (top && topKey && !hidden) trackNoticeShown("popup", topKey, top.state, "desktop");
  }, [top, topKey, hidden]);
  if (!top || hidden) return null;

  const { session, state } = top;
  const key = reminderPrefKey(session, state);
  const moreCount = visible.length - 1;

  // `live` drives the emphasized styling (pulsing dot, primary accent): the
  // member popup's "In progress", or the public popup's "Started". The
  // public "waiting for host" state stays calm — nothing to join yet.
  const live = state === "live" || state === "started";
  const heading =
    state === "live" ? "In progress" : state === "started" ? "Started" : state === "waiting" ? "Waiting for host" : "Starting soon";
  const timing =
    variant === "public"
      ? publicTimingText(session, state as PublicReminderState, now)
      : timingText(session, state as ReminderState, now);
  // Public popup: registration is only offered for open events (members-only
  // events just link to the public event page).
  const buttonLabel =
    variant !== "public"
      ? state === "live"
        ? "Join now"
        : "Join session"
      : !session.open
        ? "View event"
        : state === "started"
          ? "Join now"
          : "Register to attend";

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      onClickCapture={(event) => {
        if (isPrimaryActionTarget(event.target)) trackNotice("click", "popup", state, "desktop");
      }}
      className={cn(
        "group fixed bottom-4 right-4 z-50 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border shadow-lg",
        "animate-in fade-in slide-in-from-bottom-4 duration-200 motion-reduce:animate-none",
        "transition-colors bg-card/90 supports-[backdrop-filter]:backdrop-blur-md",
        live
          ? "border-primary/50 supports-[backdrop-filter]:bg-card/85"
          : "supports-[backdrop-filter]:bg-card/65",
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
              {heading}
            </p>
            <p className="truncate text-sm font-semibold">{session.title}</p>
            <p className="text-xs text-muted-foreground">
              {timing}
              {session.detail ? ` · ${session.detail}` : ""}
            </p>
          </div>
          <button
            type="button"
            data-live-secondary
            onClick={() => {
              trackNotice("dismiss", "popup", state, "desktop");
              update((prev) => ({ ...prev, dismissed: { ...prev.dismissed, [key]: true } }));
            }}
            aria-label={`Dismiss reminder for ${session.title}`}
            title="Dismiss"
            className="-mr-1 -mt-1 flex-shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {variant === "member" && session.rsvped === false && session.eventId ? (
            // A visible event this member hasn't RSVP'd to: an explicit RSVP
            // before the host starts, then the silent-RSVP "Join now".
            session.started ? (
              <MemberJoinButton session={session} size="sm" />
            ) : (
              <MemberRsvpButton session={session} size="sm" />
            )
          ) : variant === "public" && session.open && session.eventId ? (
            // Open event: register (or, in a browser that already registered,
            // go straight to the waiting room / meeting) without leaving the page.
            <RegisterButton
              eventId={session.eventId}
              eventTitle={session.title}
              label={buttonLabel}
              started={state === "started"}
              icon={<Video className="mr-1.5 h-4 w-4" />}
            />
          ) : (
            <Button size="sm" asChild>
              <Link href={session.joinHref}>
                <Video className="mr-1.5 h-4 w-4" />
                {buttonLabel}
              </Link>
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            data-live-secondary
            onClick={() => {
              trackNotice("dismiss", "popup", state, "desktop");
              update((prev) => ({
                ...prev,
                snoozedUntil: { ...prev.snoozedUntil, [key]: snoozeUntil(session, Date.now()) },
              }));
            }}
            title="Hide this for 5 minutes"
          >
            <BellOff className="mr-1.5 h-4 w-4" />
            Snooze 5 min
          </Button>
          {moreCount > 0 ? (
            <Link
              href={moreHref}
              data-live-secondary
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
