"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCsrfToken } from "@/lib/csrf-client";
import type { ReminderSession } from "@/lib/session-reminders";

type Size = "xs" | "sm";

const iconClass = (size: Size) => (size === "xs" ? "mr-1 h-3.5 w-3.5" : "mr-1.5 h-4 w-4");

/**
 * A signed-in member's "Join now" (live-events strip and the not-RSVP'd
 * popup). The label is the same for everyone; what differs is what's behind
 * it. The host / a member who already RSVP'd goes straight to the meeting.
 * Anyone else gets a `going` RSVP recorded silently first (POST
 * /api/events/:id/join -> ensureGoingRsvp, which is idempotent and sends no
 * email or notification) because the meeting page won't admit a non-host
 * member without one.
 */
export function MemberJoinButton({
  session,
  size = "xs",
  label = "Join now",
}: {
  session: ReminderSession;
  size?: Size;
  /** Button text (the top strip says "Join Event"; the popup and phone drawer keep "Join now"). */
  label?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const icon = <Video className={iconClass(size)} aria-hidden />;

  if (session.rsvped !== false || !session.eventId) {
    return (
      <Button size={size} asChild>
        <Link href={session.joinHref}>
          {icon}
          {label}
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
    <Button size={size} onClick={join} disabled={busy}>
      {icon}
      {label}
    </Button>
  );
}

/**
 * The explicit "RSVP" button on the member popup, shown before the host has
 * started the meeting. A deliberate RSVP, so it behaves like a normal one
 * (calendar invite, host notification on restricted events) via the
 * idempotent POST /api/events/:id/rsvp/going — never the toggling route. On
 * success the reminders query is refetched, which moves the event into the
 * member's RSVP'd list so the card flips to its RSVP'd state without a reload.
 */
export function MemberRsvpButton({ session, size = "sm" }: { session: ReminderSession; size?: Size }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function rsvp() {
    setBusy(true);
    setFailed(false);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/events/${session.eventId}/rsvp/going`, {
        method: "POST",
        headers: { "x-csrf-token": csrfToken },
      });
      if (!res.ok) throw new Error("rsvp failed");
      await queryClient.invalidateQueries({ queryKey: ["session-reminders"] });
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button size={size} onClick={rsvp} disabled={busy} title={failed ? "Couldn't RSVP — try again" : undefined}>
      {busy ? "RSVPing…" : failed ? "Try RSVP again" : "RSVP"}
    </Button>
  );
}
