"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getCsrfToken } from "@/lib/csrf-client";
import { KnowledgeStatus, type ReviewItemStatus } from "@/lib/generated/prisma/enums";

/**
 * Submitter-only "Close Review" / "Reopen" toggle, plus (once closed)
 * "Publish"/"Update Library Version" — the pre-publish quality-gate flow
 * from the design doc. Closing does not lock the comment thread, it just
 * stops counting toward reviewers' "needs feedback" badge. Publishing is
 * repeatable: the first click creates the Library item, every click after
 * that updates it in place (see publishReviewItemToLibrary), so this
 * confirms before overwriting an already-live/queued version.
 */
export function ReviewLifecycleActions({
  itemId,
  status,
  publishedKnowledgeItemId,
  publishedKnowledgeItemStatus,
}: {
  itemId: string;
  status: ReviewItemStatus;
  publishedKnowledgeItemId: string | null;
  publishedKnowledgeItemStatus: KnowledgeStatus | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [published, setPublished] = useState(publishedKnowledgeItemId);
  const [publishedStatus, setPublishedStatus] = useState(publishedKnowledgeItemStatus);

  async function toggleClose() {
    setPending(true);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/review-feedback/${itemId}/close`, {
        method: status === "open" ? "POST" : "DELETE",
        headers: { "x-csrf-token": csrfToken },
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(typeof payload?.error === "string" ? payload.error : "Something went wrong.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  async function publish() {
    if (
      published &&
      !window.confirm("This will replace the current Knowledge Library version with this item's latest content. Continue?")
    ) {
      return;
    }

    setPending(true);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/review-feedback/${itemId}/publish`, {
        method: "POST",
        headers: { "x-csrf-token": csrfToken },
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(typeof payload?.error === "string" ? payload.error : "Something went wrong.");
      }
      const data = await res.json();
      setPublished(data.knowledgeItemId);
      setPublishedStatus(data.status);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  const isLive = publishedStatus === KnowledgeStatus.published || publishedStatus === KnowledgeStatus.flagged;
  const libraryHref = isLive && published ? `/library/${published}` : "/library/mine";
  const libraryLabel =
    publishedStatus === KnowledgeStatus.rejected
      ? "Rejected by a Steward — update to resubmit →"
      : isLive
        ? "Live in the Knowledge Library →"
        : "Published to Library — pending Steward review →";

  return (
    <div className="mt-4 flex flex-col gap-2 rounded-md border p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="outline" disabled={pending} onClick={toggleClose}>
          {status === "open" ? "Close Review" : "Reopen Review"}
        </Button>

        {status === "closed" && (
          <>
            {published && (
              <Button asChild size="sm" variant="ghost">
                <Link href={libraryHref}>{libraryLabel}</Link>
              </Button>
            )}
            <Button size="sm" variant={published ? "outline" : "default"} disabled={pending} onClick={publish}>
              {published ? "Update Library Version" : "Publish to Knowledge Library"}
            </Button>
          </>
        )}
      </div>
      {status === "closed" && (
        <p className="text-xs text-muted-foreground">
          {published
            ? "Replaces the current Library listing with this item's latest content — Stewards only re-review if it was previously rejected."
            : "Goes to the Library review queue, same as any submission — a Steward still checks it before it's public."}
        </p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
