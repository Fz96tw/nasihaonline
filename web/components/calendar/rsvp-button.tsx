"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCsrfToken } from "@/lib/csrf-client";

/**
 * Toggles the current member's RSVP for an event (§4.6). Shared between
 * /calendar's event list and /events' members-only card CTA — both just
 * differ in what they do with `onToggled`'s meetingUrl (the calendar list
 * reveals it inline; /events never receives one, since getEventsForViewer
 * doesn't select it).
 */
export function RsvpButton({
  eventId,
  rsvped,
  onToggled,
}: {
  eventId: string;
  rsvped: boolean;
  onToggled: (result: { rsvped: boolean; meetingUrl: string | null; attendeeCount?: number }) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setPending(true);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/events/${eventId}/rsvp`, {
        method: "POST",
        headers: { "x-csrf-token": csrfToken },
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(typeof payload?.error === "string" ? payload.error : "Something went wrong.");
      }
      const result = await res.json();
      onToggled(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <Button
        size="sm"
        variant={rsvped ? "outline" : "default"}
        disabled={pending}
        onClick={toggle}
      >
        {rsvped ? (
          <>
            <CheckCircle2 className="mr-1.5 h-4 w-4 text-emerald-600" />
            You&apos;re going
          </>
        ) : (
          "RSVP"
        )}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
