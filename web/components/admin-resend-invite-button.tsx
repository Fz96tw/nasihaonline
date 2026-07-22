"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { getCsrfToken } from "@/lib/csrf-client";

export function AdminResendInviteButton({ applicationId }: { applicationId: string }) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

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
      setResult({ ok: true, message: "Invite email re-sent." });
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : "Something went wrong." });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:col-span-2">
      <Button variant="outline" size="sm" disabled={pending} onClick={resend}>
        {pending ? "Resending…" : "Resend invite email"}
      </Button>
      {result && (
        <p className={`text-sm ${result.ok ? "text-muted-foreground" : "text-destructive"}`}>{result.message}</p>
      )}
    </div>
  );
}
