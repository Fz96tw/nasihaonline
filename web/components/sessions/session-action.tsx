"use client";

import Link from "next/link";
import { Video } from "lucide-react";
import { RegisterButton } from "@/components/events/register-button";
import { MemberJoinButton, MemberRsvpButton } from "@/components/sessions/member-join-button";
import { Button } from "@/components/ui/button";
import type { ReminderSession } from "@/lib/session-reminders";

/**
 * The primary button of a live-event notice for each audience x state — the
 * same logic the popup and the strip use, in one place for the phone drawer.
 *
 *  - Visitor (`audience="public"`; states soon / waiting / started): open events
 *    register (or, in a browser that already registered, go to the waiting room
 *    / meeting) — "Register to attend", "Join now" once started; members-only
 *    events just link to the public event page ("View event").
 *  - Member (`audience="member"`; states soon / live): a visible event they
 *    haven't RSVP'd to shows "RSVP" until the host starts, then the silent-RSVP
 *    "Join now"; their own (hosted / RSVP'd / 1-on-1) events link straight to the
 *    meeting ("Join session", "Join now" once in progress).
 */
export function SessionAction({
  session,
  state,
  audience,
  compact = false,
}: {
  session: ReminderSession;
  state: string;
  audience: "public" | "member";
  /** Shorter labels for the one-line collapsed peek bar ("Register", "Join"), where width is scarce. */
  compact?: boolean;
}) {
  const icon = <Video className="mr-1.5 h-4 w-4" aria-hidden />;

  if (audience === "public") {
    const started = state === "started";
    if (session.open && session.eventId) {
      return (
        <RegisterButton
          eventId={session.eventId}
          eventTitle={session.title}
          label={started ? "Join now" : compact ? "Register" : "Register to attend"}
          started={started}
          icon={icon}
          size="sm"
        />
      );
    }
    return (
      <Button size="sm" asChild>
        <Link href={session.joinHref}>
          {icon}
          {compact ? "View" : "View event"}
        </Link>
      </Button>
    );
  }

  if (session.rsvped === false && session.eventId) {
    return session.started ? <MemberJoinButton session={session} size="sm" /> : <MemberRsvpButton session={session} size="sm" />;
  }
  return (
    <Button size="sm" asChild>
      <Link href={session.joinHref}>
        {icon}
        {state === "live" ? "Join now" : compact ? "Join" : "Join session"}
      </Link>
    </Button>
  );
}
