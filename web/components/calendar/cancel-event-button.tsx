"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCsrfToken } from "@/lib/csrf-client";

/**
 * Host/admin-facing "Cancel Event" action, only rendered for a restricted
 * event (Audience-Restricted Group Events, Objective 03) — cancelling
 * notifies every current invitee. Once cancelled the event no longer
 * resolves via getMemberEventById for anyone (including the host), so this
 * navigates back to /calendar rather than staying on a page that would
 * immediately 404 on refresh.
 */
export function CancelEventButton({ eventId, title }: { eventId: string; title: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCancel() {
    if (!window.confirm(`Cancel "${title}"? Every invited member will be notified.`)) return;

    setPending(true);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/events/${eventId}/cancel`, {
        method: "POST",
        headers: { "x-csrf-token": csrfToken },
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(typeof payload?.error === "string" ? payload.error : "Something went wrong.");
      }
      router.push("/calendar");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        size="sm"
        variant="outline"
        className="text-destructive hover:text-destructive"
        disabled={pending}
        onClick={handleCancel}
      >
        <Ban className="mr-1.5 h-4 w-4" />
        Cancel Event
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
