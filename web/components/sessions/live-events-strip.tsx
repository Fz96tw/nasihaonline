"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { Video } from "lucide-react";
import { RegisterButton } from "@/components/events/register-button";
import { MemberJoinButton, MemberRsvpButton } from "@/components/sessions/member-join-button";
import { Button } from "@/components/ui/button";
import { useIsPhone } from "@/hooks/use-is-phone";
import { useReminderSessions } from "@/hooks/use-reminder-sessions";
import { isPrimaryActionTarget, trackNotice, trackNoticeShown } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { compareReminders, publicReminderStateOf, reminderPrefKey, type PublicReminderState, type ReminderSession } from "@/lib/session-reminders";

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
 * A signed-in member's strip button. Started: "Join Event" (silent RSVP when
 * needed). Waiting for the host: "RSVP" for a member who hasn't RSVP'd (an
 * explicit RSVP — nothing to join yet), otherwise the waiting room.
 */
function MemberStripButton({ session, state }: { session: ReminderSession; state: PublicReminderState }) {
  if (state === "started") return <MemberJoinButton session={session} size="xs" variant="live" />;
  if (session.rsvped === false && session.eventId) return <MemberRsvpButton session={session} size="xs" variant="live" />;
  return (
    <Button size="xs" variant="live" asChild>
      <Link href={session.joinHref}>
        {joinIcon}
        Open waiting room
      </Link>
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
        label={started ? "Join Event" : "Register to attend"}
        started={started}
        icon={joinIcon}
        size="xs"
        variant="live"
      />
    );
  }
  return (
    <Button size="xs" variant="live" asChild>
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
 * dismissed — so it stays visible while an event is live and never hides on
 * scroll (unlike the search row above it). Its current height is published
 * in `--live-strip-height` (0 when empty) so anything sticky below the
 * header (e.g. the member sidebar) can offset below it. Shows at most MAX_LINES events, then "+N more" -> /events;
 * phones show one event plus "+N more" (members: -> /calendar; visitors: -> /events).
 *
 * Two audiences:
 *  - signed-out visitors (public endpoint): every public event whose
 *    scheduled start has arrived — waiting for the host, or started — with the
 *    register / join buttons the popup uses.
 *  - signed-in members (member endpoint): every event they can see that the
 *    host has started ("Join Event", which silently RSVPs when needed) or that is
 *    waiting for the host past its scheduled start ("RSVP", or "Open waiting
 *    room" if already RSVP'd).
 *
 * `mode="auto"` (marketing pages) picks the audience from Clerk's client
 * state; `mode="member"` is for the signed-in app header, where the server
 * already knows. With `belowSearchRow` the strip sits under HeaderSearchRow
 * and its `top` follows that row's scroll-driven height, so it glides up
 * under the header when the row hides rather than hiding itself.
 */
export function LiveEventsStrip({
  mode = "auto",
  stickyTop = "var(--header-height)",
  belowSearchRow = false,
}: {
  mode?: "auto" | "member";
  /** CSS `top` for the sticky strip — directly under whatever header rows are above it. */
  stickyTop?: string;
  /** The strip sits under HeaderSearchRow (member header) rather than directly under the header. */
  belowSearchRow?: boolean;
}) {
  const { isLoaded, isSignedIn } = useAuth();
  const pathname = usePathname();
  const isMember = mode === "member" || (isLoaded && Boolean(isSignedIn));
  const isPublic = mode === "auto" && isLoaded && !isSignedIn;
  const endpoint = isMember ? MEMBER_ENDPOINT : isPublic ? PUBLIC_ENDPOINT : null;
  // "+N more" opens the page that lists every live event for this audience: the
  // member's own calendar (same destination as the member popup), or the public
  // /events page for signed-out visitors.
  const moreHref = isMember ? "/calendar" : "/events";
  // The meeting screen has its own chrome — the strip would sit over it.
  const onMeetingScreen = pathname.startsWith("/meet");
  // On phones the bottom drawer (live-events-drawer.tsx) replaces this strip.
  const isPhone = useIsPhone();

  const { data: sessions } = useReminderSessions(onMeetingScreen || isPhone ? null : endpoint);
  const [now, setNow] = useState(() => Date.now());
  const innerRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const live = (sessions ?? [])
    .flatMap((session) => {
      const state = publicReminderStateOf(session, now);
      // Everyone sees host-started events, and the "waiting for host" ones
      // (scheduled start reached, host hasn't started) — the server already
      // applied each audience's rules (e.g. a host's own waiting event isn't sent).
      return state === "started" || state === "waiting" ? [{ session, state }] : [];
    })
    .sort(compareReminders);
  const hasItems = !isPhone && live.length > 0;

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

  const topLive = live[0];
  useEffect(() => {
    if (hasItems && topLive) trackNoticeShown("strip", reminderPrefKey(topLive.session, topLive.state), topLive.state, "desktop");
  }, [hasItems, topLive]);

  const height = hasItems ? contentHeight : 0;
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
      onClickCapture={(event) => {
        if (topLive && isPrimaryActionTarget(event.target)) trackNotice("click", "strip", topLive.state, "desktop");
      }}
      className={cn(
        // `top` transitions too: it's derived from --search-row-height, which changes
        // instantly while the search row's own height animates over the same 300ms.
        "sticky overflow-hidden frosted-nav shadow-sm transition-[height,top] duration-300 ease-in-out",
        // Under the member header's search row (z-40) it slides beneath it.
        belowSearchRow ? "z-30" : "z-40",
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
                {isMember ? <MemberStripButton session={session} state={state} /> : <PublicStripButton session={session} state={state} />}
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
                      <Link href={moreHref} data-live-secondary className="font-medium text-primary underline-offset-4 hover:underline sm:hidden">
                        +{phoneMore} more
                      </Link>
                    ) : null}
                    {isLast && index > 0 && desktopMore > 0 ? (
                      <Link href={moreHref} data-live-secondary className="hidden font-medium text-primary underline-offset-4 hover:underline sm:inline">
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
