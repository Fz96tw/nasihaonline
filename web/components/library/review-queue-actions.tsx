"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getCsrfToken } from "@/lib/csrf-client";

/** Publish/Reject buttons for one /admin/library/review-queue row (§4.9). */
export function ReviewQueueActions({ itemId }: { itemId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<"publish" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "publish" | "reject") {
    setPending(action);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/admin/library/${itemId}/publish`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(typeof payload?.error === "string" ? payload.error : "Something went wrong.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={pending !== null} onClick={() => act("reject")}>
          {pending === "reject" ? "Rejecting…" : "Reject"}
        </Button>
        <Button size="sm" disabled={pending !== null} onClick={() => act("publish")}>
          {pending === "publish" ? "Publishing…" : "Publish"}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
