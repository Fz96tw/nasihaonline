"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCsrfToken } from "@/lib/csrf-client";
import { formatTimestamp } from "@/lib/format-date";
import type { EventNotificationBroadcastItem } from "@/lib/events";

/**
 * Host/admin-facing "Resend Notifications" (event detail page) — rendered
 * for any still-live event (EventDetail gates on `canEdit`, mirroring
 * resendEventNotifications' own server-side checks). Re-sends the same
 * announcement createEvent sends automatically at creation, e.g. as a
 * reminder closer to the date, and appends the send to the trail below
 * rather than requiring a full page refresh. `restricted` swaps the copy
 * for a restricted event, whose audience is its current invitee list (plus,
 * for a community `open` event, its anonymous EventRegistration guests get
 * an email reminder too — folded into the same recipientCount) rather than
 * every member.
 */
export function ResendNotifications({
  eventId,
  restricted,
  initialBroadcasts,
}: {
  eventId: string;
  restricted: boolean;
  initialBroadcasts: EventNotificationBroadcastItem[];
}) {
  const [broadcasts, setBroadcasts] = useState(initialBroadcasts);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleResend() {
    const confirmMessage = restricted
      ? "Resend this event's invitation to every currently invited member?"
      : "Resend this event's announcement to every member (and any registered guests)?";
    if (!window.confirm(confirmMessage)) return;

    setPending(true);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/events/${eventId}/resend-notifications`, {
        method: "POST",
        headers: { "x-csrf-token": csrfToken },
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "Something went wrong.");
      }
      setBroadcasts((prev) => [
        {
          id: `local-${Date.now()}`,
          sentAt: new Date().toISOString(),
          sentByName: "You",
          recipientCount: payload.recipientCount as number,
        },
        ...prev,
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 border-t pt-6">
      <div>
        <h2 className="text-sm font-semibold">Notifications</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {restricted
            ? "Every invited member already got a bell notification and email asking them to RSVP. Resend to send a fresh reminder to whoever's currently invited."
            : "Every member already got a bell notification and email when this event was scheduled — and, if this event is open for public registration, so did every registered guest. Resend to send a fresh one now, useful as a reminder as the date gets closer."}
        </p>
      </div>

      <div>
        <Button size="sm" variant="outline" disabled={pending} onClick={handleResend}>
          <Bell className="mr-1.5 h-4 w-4" />
          {pending ? "Sending…" : "Resend Notifications"}
        </Button>
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </div>

      {broadcasts.length > 0 ? (
        <ul className="flex flex-col divide-y text-sm">
          {broadcasts.map((broadcast) => (
            <li key={broadcast.id} className="flex items-center justify-between gap-3 py-2 text-muted-foreground">
              <span>
                Sent by {broadcast.sentByName} to {broadcast.recipientCount}{" "}
                {broadcast.recipientCount === 1 ? "recipient" : "recipients"}
              </span>
              <span>{formatTimestamp(broadcast.sentAt)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No notifications sent yet.</p>
      )}
    </div>
  );
}
