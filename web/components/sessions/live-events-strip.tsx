"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { Video } from "lucide-react";
import { RegisterButton } from "@/components/events/register-button";
import { Button } from "@/components/ui/button";
import { useReminderSessions } from "@/hooks/use-reminder-sessions";
import { useScrollReveal } from "@/hooks/use-scroll-reveal";
import { cn } from "@/lib/utils";
import { publicReminderStateOf, type PublicReminderState, type ReminderSession } from "@/lib/session-reminders";

const TICK_MS = 15_000;
const MAX_LINES = 2;
const LINE_HEIGHT_PX = 36;
const PUBLIC_ENDPOINT = "/api/public-session-reminders";

function timingText(session: ReminderSession, state: PublicReminderState, now: number) {
  if (state === "waiting") return "Waiting for host";
  const minutes = Math.floor((now - Date.parse(session.startsAt)) / 60_000);
  return minutes < 1 ? "Just started" : `Started ${minutes} min ago`;
}

function StripButton({ session, state }: { session: ReminderSession; state: PublicReminderState }) {
  const started = state === "started";
  const icon = <Video className="mr-1 h-3.5 w-3.5" aria-hidden />;
  // Same buttons as the popup: open events register / join in place (a browser
  // that already registered goes straight to the waiting room or meeting);
  // members-only events just open the public event page.
  if (session.open && session.eventId) {
    return (
      <RegisterButton
        eventId={session.eventId}
        eventTitle={session.title}
        label={started ? "Join now" : "Register to attend"}
        started={started}
        icon={icon}
        size="xs"
      />
    );
  }
  return (
    <Button size="xs" asChild>
      <Link href={session.joinHref}>
        {icon}
        View event
      </Link>
    </Button>
  );
}

/**
 * Persistent live-events strip for signed-out visitors, sticky directly under
 * the marketing header: every public event whose scheduled start has arrived
 * (or that the host has started early) and hasn't reached its scheduled end.
 * Deliberately has no dismiss control — it's the way back to an event after
 * the popup has been dismissed. Hides on scroll down / reappears on scroll up
 * (shared with HeaderSearchRow via useScrollReveal); its current height is
 * published in `--live-strip-height` (0 when hidden or empty) for anything
 * that needs to offset below it. Shows at most MAX_LINES events, then
 * "+N more" -> /events; phones show one event plus "+N more".
 */
export function LiveEventsStrip() {
  const { isLoaded, isSignedIn } = useAuth();
  const signedOut = isLoaded && !isSignedIn;
  const { data: sessions } = useReminderSessions(PUBLIC_ENDPOINT);
  const [now, setNow] = useState(() => Date.now());
  const [revealed, setRevealed] = useState(true);
  const innerRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const live = signedOut
    ? (sessions ?? [])
        .flatMap((session) => {
          const state = publicReminderStateOf(session, now);
          return state === "waiting" || state === "started" ? [{ session, state }] : [];
        })
        .sort((a, b) => Date.parse(a.session.startsAt) - Date.parse(b.session.startsAt))
    : [];
  const hasItems = live.length > 0;

  useScrollReveal(setRevealed, hasItems);

  // Measured rather than hard-coded: the number of lines differs between
  // phone (1) and desktop (up to MAX_LINES).
  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const update = () => setContentHeight(el.offsetHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasItems]);

  const height = hasItems && revealed ? contentHeight : 0;
  useEffect(() => {
    document.documentElement.style.setProperty("--live-strip-height", `${height}px`);
    return () => document.documentElement.style.setProperty("--live-strip-height", "0px");
  }, [height]);

  if (!hasItems) return null;

  const shown = live.slice(0, MAX_LINES);
  const desktopMore = live.length - MAX_LINES;
  const phoneMore = live.length - 1;

  return (
    <div
      role="region"
      aria-label="Live events"
      style={{ height }}
      className={cn(
        "sticky top-[var(--header-height)] z-40 overflow-hidden bg-background shadow-sm transition-[height] duration-300 ease-in-out",
        height > 0 && "border-b",
      )}
    >
      <div ref={innerRef} className="flex flex-col px-4 lg:px-8">
        {shown.map(({ session, state }, index) => {
          const isLast = index === shown.length - 1;
          return (
            <div
              key={session.key}
              style={{ height: LINE_HEIGHT_PX }}
              // Phones: only the first event. Desktop: all shown (MAX_LINES).
              className={cn("items-center gap-2 text-xs", index === 0 ? "flex" : "hidden sm:flex")}
            >
              {state === "started" ? (
                <span className="relative flex h-2 w-2 flex-shrink-0" aria-hidden>
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75 motion-reduce:animate-none" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                </span>
              ) : (
                <span className="h-2 w-2 flex-shrink-0 rounded-full bg-muted-foreground/40" aria-hidden />
              )}
              <span className="min-w-0 truncate font-semibold">{session.title}</span>
              <span className="hidden flex-shrink-0 text-muted-foreground sm:inline">· {timingText(session, state, now)}</span>
              <span className="ml-auto flex flex-shrink-0 items-center gap-3">
                <StripButton session={session} state={state} />
                {/* "+N more" lives in a fixed-width slot on every line (when there is
                    one at this breakpoint) so the buttons stay aligned whichever
                    line carries the link. Phones show it on the single line;
                    desktop on the last of the MAX_LINES lines. */}
                {phoneMore > 0 || desktopMore > 0 ? (
                  <span
                    className={cn(
                      "w-14 flex-shrink-0 text-right",
                      phoneMore > 0 ? "block" : "hidden",
                      desktopMore > 0 ? "sm:block" : "sm:hidden",
                    )}
                  >
                    {index === 0 && phoneMore > 0 ? (
                      <Link href="/events" className="font-medium text-primary underline-offset-4 hover:underline sm:hidden">
                        +{phoneMore} more
                      </Link>
                    ) : null}
                    {isLast && index > 0 && desktopMore > 0 ? (
                      <Link href="/events" className="hidden font-medium text-primary underline-offset-4 hover:underline sm:inline">
                        +{desktopMore} more
                      </Link>
                    ) : null}
                  </span>
                ) : null}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
