"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getCsrfToken } from "@/lib/csrf-client";
import type { ReviewVolunteerStatus } from "@/lib/generated/prisma/enums";

/**
 * One-click "Offer to Review" on a Members-Seeking-Reviewers card —
 * minimizing friction is the whole point of the open-call mode, so this
 * posts immediately rather than opening a dialog. Flips to a
 * withdraw-capable "Offer sent" state once posted, mirrors LibraryFlagButton's
 * small-client-island shape.
 */
export function ReviewOfferButton({ itemId, initialStatus }: { itemId: string; initialStatus: ReviewVolunteerStatus | null }) {
  const router = useRouter();
  const [status, setStatus] = useState<ReviewVolunteerStatus | null>(initialStatus);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function offer() {
    setPending(true);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/review-feedback/${itemId}/volunteer`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ note: null }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(typeof payload?.error === "string" ? payload.error : "Something went wrong.");
      }
      setStatus("pending" as ReviewVolunteerStatus);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  async function withdraw() {
    setPending(true);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/review-feedback/${itemId}/volunteer`, {
        method: "DELETE",
        headers: { "x-csrf-token": csrfToken },
      });
      if (!res.ok) throw new Error("Something went wrong.");
      setStatus("withdrawn" as ReviewVolunteerStatus);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  if (status === "accepted") {
    return <Badge variant="success">You&apos;re reviewing this</Badge>;
  }

  if (status === "pending") {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={withdraw}>
          Offer sent — Withdraw
        </Button>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" size="sm" disabled={pending} onClick={offer}>
        {pending ? "Sending…" : "Offer to Review"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
