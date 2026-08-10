"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { getCsrfToken } from "@/lib/csrf-client";

export function AdminResendInviteButton({
  applicationId,
  lastInvitedAt,
}: {
  applicationId: string;
  lastInvitedAt: Date | null;
}) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  // Seeded from the server-rendered value, then updated locally after a
  // successful resend so the "last invited" timestamp is accurate without
  // a full page refresh — each resend revokes the prior invite link, so
  // this is the point past which only the newest email's link still works.
  const [lastInvited, setLastInvited] = useState(lastInvitedAt);

  async function resend() {
    setPending(true);
    setResult(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/admin/applications/${applicationId}/resend-invite`, {
        method: "POST",
        headers: { "x-csrf-token": csrfToken },
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.error ?? "Request failed");
      }
      if (payload?.lastInvitedAt) setLastInvited(new Date(payload.lastInvitedAt));
      setResult({ ok: true, message: "Invite email re-sent." });
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : "Something went wrong." });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:col-span-2">
      {lastInvited && (
        <p className="text-sm text-muted-foreground">Last invited: {lastInvited.toLocaleString()}</p>
      )}
      <Button variant="outline" size="sm" disabled={pending} onClick={resend}>
        {pending ? "Resending…" : "Resend invite email"}
      </Button>
      {result && (
        <p className={`text-sm ${result.ok ? "text-muted-foreground" : "text-destructive"}`}>{result.message}</p>
      )}
    </div>
  );
}
