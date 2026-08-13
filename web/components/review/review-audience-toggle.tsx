"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Switch } from "@/components/ui/switch";
import { getCsrfToken } from "@/lib/csrf-client";

/**
 * Submitter-facing audience switch on a ReviewItem's detail page — lets a
 * submitter open an invite-only item to volunteer offers, or close an open
 * call back down to just its invited list, after submission. The create/edit
 * form (submit-review-item-form.tsx) deliberately doesn't expose this — it's
 * fixed at creation there — so this is the only place seekingReviewers can
 * change post-creation, via the pre-existing but previously unwired
 * PATCH /api/review-feedback/:id/seeking route.
 */
export function ReviewAudienceToggle({
  itemId,
  initialSeekingReviewers,
  inviteeCount,
}: {
  itemId: string;
  initialSeekingReviewers: boolean;
  inviteeCount: number;
}) {
  const router = useRouter();
  const [seekingReviewers, setSeekingReviewers] = useState(initialSeekingReviewers);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(value: boolean) {
    if (!value && inviteeCount === 0) {
      const proceed = window.confirm(
        "This item has no invited reviewers. Turning off volunteer requests will make it invisible to reviewers until you invite someone. Continue?",
      );
      if (!proceed) return;
    }

    setPending(true);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/review-feedback/${itemId}/seeking`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ value }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(typeof payload?.error === "string" ? payload.error : "Something went wrong.");
      }
      setSeekingReviewers(value);
      // Re-fetches the server-rendered detail page so the volunteer-offers
      // panel and What's New/"Members Seeking Reviewers" listing state
      // (both driven by the server, not this component) reflect the change.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t pt-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Open to volunteer reviewers</h2>
          <p className="text-xs text-muted-foreground">
            {seekingReviewers
              ? "Any member can see and offer to review this in What's New and Members Seeking Reviewers."
              : "Only your invited reviewers can see this. Turn this on to also open it up to volunteers."}
          </p>
        </div>
        <Switch checked={seekingReviewers} onCheckedChange={toggle} disabled={pending} />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
