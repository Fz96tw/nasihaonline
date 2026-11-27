"use client";

import { type MouseEvent, type ReactNode, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, MessageSquare, Users, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RsvpButton } from "@/components/calendar/rsvp-button";
import { useEventStatus } from "@/components/feed/feed-event-date-badge";
import { getCsrfToken } from "@/lib/csrf-client";
import type { FeedItem } from "@/lib/feed";

/**
 * The row sits inside the feed row's <Link>, so a click on the button must
 * not also navigate to the event page — same swallowing as the row's
 * FollowMemberButton wrapper.
 */
function StopRowLink({ children }: { children: ReactNode }) {
  return (
    <span
      onClick={(event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      {children}
    </span>
  );
}

/**
 * "Join now" while the event is live. A host/co-host or a member who
 * already RSVP'd goes straight to the meeting page; anyone else gets a
 * `going` RSVP recorded silently first via POST /api/events/:id/join
 * (ensureGoingRsvp: idempotent, no email/notification, and the same
 * invite-list 403 as RSVP for restricted events), since the meeting page
 * won't admit a non-host member without one. Same flow as the live-events
 * strip's MemberJoinButton.
 */
function JoinNowButton({ eventId, direct }: { eventId: string; direct: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const meetingPath = `/meet/event/${eventId}`;

  async function join() {
    if (direct) {
      router.push(meetingPath);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/events/${eventId}/join`, {
        method: "POST",
        headers: { "x-csrf-token": csrfToken },
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(typeof payload?.error === "string" ? payload.error : "Couldn't join — try again.");
      router.push(typeof payload?.joinPath === "string" ? payload.joinPath : meetingPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't join — try again.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button size="xs" onClick={join} disabled={busy} className="bg-red-600 text-white hover:bg-red-700">
        <Video className="mr-1 h-3.5 w-3.5" aria-hidden />
        {busy ? "Joining…" : "Join now"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

/**
 * An event row's footer: the viewer's action on the left (RSVP / You're
 * going / Join now — see the state table below) and the view / attendee /
 * reply counts on the right. The attendee count lives here, not in FeedRow,
 * so an RSVP toggle can update it in place from the API's returned count.
 *
 * - live + has a meeting                → Join now (host, co-host, or anyone allowed to RSVP)
 * - upcoming, or live without a meeting → RSVP / You're going (not for the host, who never RSVPs; co-hosts may)
 * A co-host also gets a "You're co-hosting" badge beside the button, until the event ends.
 * - ended                               → no button
 * Before mount (status unknown) no button renders, so SSR and hydration agree.
 * `item.eventActions` is absent when the viewer can't RSVP at all (a
 * restricted event they're not invited to) — then only the counts render.
 */
export function FeedEventFooter({ item }: { item: FeedItem }) {
  const queryClient = useQueryClient();
  const status = useEventStatus(item.eventStartsAt!, item.eventEndsAt);
  const actions = item.eventActions;
  const [rsvped, setRsvped] = useState(actions?.rsvped ?? false);
  const [attendeeCount, setAttendeeCount] = useState(item.attendeeCount);

  let action: ReactNode = null;
  if (actions && status && status.kind !== "ended") {
    if (status.kind === "live" && actions.hasMeeting) {
      action = <JoinNowButton eventId={actions.eventId} direct={actions.isHost || actions.isCoHost || rsvped} />;
    } else if (!actions.isHost) {
      action = (
        <RsvpButton
          eventId={actions.eventId}
          rsvped={rsvped}
          size="xs"
          onToggled={(result) => {
            setRsvped(result.rsvped);
            if (result.attendeeCount !== undefined) setAttendeeCount(result.attendeeCount);
            // Keeps the sidebar's upcoming/live-sessions list in step.
            void queryClient.invalidateQueries({ queryKey: ["session-reminders"] });
          }}
        />
      );
    }
  }

  if (actions?.isCoHost && status && status.kind !== "ended") {
    action = (
      <div className="flex flex-wrap items-center gap-2">
        {action}
        <Badge variant="info">You&apos;re co-hosting</Badge>
      </div>
    );
  }

  const hasCounts = attendeeCount !== undefined;
  if (!action && !hasCounts) return null;

  return (
    <div className="mt-2 flex items-start justify-between gap-3">
      <div>{action && <StopRowLink>{action}</StopRowLink>}</div>
      {hasCounts && (
        <div className="flex h-7 items-center gap-3 text-xs text-muted-foreground">
          {item.eventViewCount !== undefined && (
            <span className="flex items-center gap-1" title="Unique visitors">
              <Eye className="h-3.5 w-3.5" />
              {item.eventViewCount}
            </span>
          )}
          <span className="flex items-center gap-1" title="Registered or RSVP'd">
            <Users className="h-3.5 w-3.5" />
            {attendeeCount}
          </span>
          {item.forumReplyCount !== undefined && (
            <span className="flex items-center gap-1" title="Discussion thread replies">
              <MessageSquare className="h-3.5 w-3.5" />
              {item.forumReplyCount}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
