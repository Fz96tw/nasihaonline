"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { Video } from "lucide-react";
import { useSearchQuery } from "@/components/header-search-context";
import { RegisterButton } from "@/components/events/register-button";
import { Button } from "@/components/ui/button";
import { useReminderSessions } from "@/hooks/use-reminder-sessions";
import { useScrollReveal } from "@/hooks/use-scroll-reveal";
import { getCsrfToken } from "@/lib/csrf-client";
import { cn } from "@/lib/utils";
import { publicReminderStateOf, type PublicReminderState, type ReminderSession } from "@/lib/session-reminders";

const TICK_MS = 15_000;
const MAX_LINES = 2;
const LINE_HEIGHT_PX = 36;
const PUBLIC_ENDPOINT = "/api/public-session-reminders";
const MEMBER_ENDPOINT = "/api/member-live-events";

function timingText(session: ReminderSession, state: PublicReminderState, now: number) {
  if (state === "waiting") return "Waiting for host";
  const minutes = Math.floor((now - Date.parse(session.startsAt)) / 60_000);
  return minutes < 1 ? "Just started" : `Started ${minutes} min ago`;
}

const joinIcon = <Video className="mr-1 h-3.5 w-3.5" aria-hidden />;

/**
 * A signed-in member's "Join now". The label is the same for everyone; what
 * differs is what's behind it. The host / a member who already RSVP'd goes
 * straight to the meeting. Anyone else gets a `going` RSVP recorded silently
 * first (POST /api/events/:id/join -> ensureGoingRsvp, which is idempotent and
 * sends no email or notification) because the meeting page won't admit a
 * non-host member without one.
 */
function MemberJoinButton({ session }: { session: ReminderSession }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (session.rsvped || !session.eventId) {
    return (
      <Button size="xs" asChild>
        <Link href={session.joinHref}>
          {joinIcon}
          Join now
        </Link>
      </Button>
    );
  }

  async function join() {
    setBusy(true);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/events/${session.eventId}/join`, {
        method: "POST",
        headers: { "x-csrf-token": csrfToken },
      });
      if (!res.ok) throw new Error("join failed");
      const { joinPath } = (await res.json()) as { joinPath: string };
      router.push(joinPath);
    } catch {
      // The meeting page itself explains why this member can't be admitted.
      router.push(session.joinHref);
    }
  }

  return (
    <Button size="xs" onClick={join} disabled={busy}>
      {joinIcon}
      Join now
    </Button>
  );
}

function PublicStripButton({ session, state }: { session: ReminderSession; state: PublicReminderState }) {
  const started = state === "started";
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
        icon={joinIcon}
        size="xs"
      />
    );
  }
  return (
    <Button size="xs" asChild>
      <Link href={session.joinHref}>
        {joinIcon}
        View event
      </Link>
    </Button>
  );
}

/**
 * Persistent live-events strip, sticky under the page header. It has no
 * dismiss control — it's the way back to an event after the popup has been
 * dismissed — and hides on scroll down / reappears on scroll up. Its current
 * height is published in `--live-strip-height` (0 when hidden or empty) so
 * anything sticky below the header (e.g. the member sidebar) can offset
 * below it. Shows at most MAX_LINES events, then "+N more" -> /events;
 * phones show one event plus "+N more".
 *
 * Two audiences:
 *  - signed-out visitors (public endpoint): every public event whose
 *    scheduled start has arrived — waiting for the host, or started — with the
 *    register / join buttons the popup uses.
 *  - signed-in members (member endpoint): every event they can see that the
 *    host has started, with a "Join now" that silently RSVPs when needed.
 *
 * `mode="auto"` (marketing pages) picks the audience from Clerk's client
 * state; `mode="member"` is for the signed-in app header, where the server
 * already knows. With `followSearchRow` the strip slides in lockstep with
 * HeaderSearchRow (it reads that row's revealed state instead of running its
 * own scroll listener).
 */
export function LiveEventsStrip({
  mode = "auto",
  stickyTop = "var(--header-height)",
  followSearchRow = false,
}: {
  mode?: "auto" | "member";
  /** CSS `top` for the sticky strip — directly under whatever header rows are above it. */
  stickyTop?: string;
  followSearchRow?: boolean;
}) {
  const { isLoaded, isSignedIn } = useAuth();
  const pathname = usePathname();
  const isMember = mode === "member" || (isLoaded && Boolean(isSignedIn));
  const isPublic = mode === "auto" && isLoaded && !isSignedIn;
  const endpoint = isMember ? MEMBER_ENDPOINT : isPublic ? PUBLIC_ENDPOINT : null;
  // The meeting screen has its own chrome — the strip would sit over it.
  const onMeetingScreen = pathname.startsWith("/meet");

  const { data: sessions } = useReminderSessions(onMeetingScreen ? null : endpoint);
  const [now, setNow] = useState(() => Date.now());
  const [ownRevealed, setOwnRevealed] = useState(true);
  const { searchRowVisible } = useSearchQuery();
  const innerRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const live = (sessions ?? [])
    .flatMap((session) => {
      const state = publicReminderStateOf(session, now);
      // Members: the server already lists only host-started events. Visitors:
      // also the "waiting for host" ones (scheduled start reached).
      return state === "started" || (isPublic && state === "waiting") ? [{ session, state }] : [];
    })
    .sort((a, b) => Date.parse(a.session.startsAt) - Date.parse(b.session.startsAt));
  const hasItems = live.length > 0;

  useScrollReveal(setOwnRevealed, hasItems && !followSearchRow);
  const revealed = followSearchRow ? searchRowVisible : ownRevealed;

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
      style={{ height, top: stickyTop }}
      className={cn(
        "sticky overflow-hidden bg-background shadow-sm transition-[height] duration-300 ease-in-out",
        // Under the member header's search row (z-40) it slides beneath it.
        followSearchRow ? "z-30" : "z-40",
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
                {isMember ? <MemberJoinButton session={session} /> : <PublicStripButton session={session} state={state} />}
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
