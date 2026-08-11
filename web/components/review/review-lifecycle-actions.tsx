"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getCsrfToken } from "@/lib/csrf-client";
import type { ReviewItemStatus } from "@/lib/generated/prisma/enums";

/**
 * Submitter-only "Close Review" / "Reopen" toggle, plus (once closed and
 * not yet published) "Publish to Knowledge Library" — the pre-publish
 * quality-gate flow from the design doc. Closing does not lock the comment
 * thread, it just stops counting toward reviewers' "needs feedback" badge.
 */
export function ReviewLifecycleActions({
  itemId,
  status,
  publishedKnowledgeItemId,
}: {
  itemId: string;
  status: ReviewItemStatus;
  publishedKnowledgeItemId: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [published, setPublished] = useState(publishedKnowledgeItemId);

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
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-2 rounded-md border p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="outline" disabled={pending} onClick={toggleClose}>
          {status === "open" ? "Close Review" : "Reopen Review"}
        </Button>

        {status === "closed" &&
          (published ? (
            <Button asChild size="sm" variant="ghost">
              <Link href="/library/mine">Published to Library — pending Steward review →</Link>
            </Button>
          ) : (
            <Button size="sm" disabled={pending} onClick={publish}>
              Publish to Knowledge Library
            </Button>
          ))}
      </div>
      {status === "closed" && !published && (
        <p className="text-xs text-muted-foreground">
          Goes to the Library review queue, same as any submission — a Steward still checks it before it&apos;s public.
        </p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
