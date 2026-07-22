"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCsrfToken } from "@/lib/csrf-client";
import { LIBRARY_FORUM_SLUG } from "@/lib/forums";

/**
 * On-demand discussion link on /library/[id] (§4.9) — "Join the Discussion"
 * (a plain Link) when initialThreadId is already set; "Start a Discussion"
 * (a button that POSTs to create the thread, then navigates into it)
 * otherwise. Mirrors EventDetail's "Discuss this event" link, but Events'
 * thread is created eagerly at submission time so it never needs a
 * "start" affordance — only Library's is on-demand.
 */
export function LibraryDiscussionLink({
  itemId,
  initialThreadId,
  initialReplyCount,
}: {
  itemId: string;
  initialThreadId: string | null;
  initialReplyCount: number | null;
}) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (initialThreadId) {
    return (
      <Link
        href={`/forums/${LIBRARY_FORUM_SLUG}/${initialThreadId}`}
        className="flex w-fit items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        <MessageSquare className="h-4 w-4" />
        Join the Discussion{initialReplyCount ? ` (${initialReplyCount})` : ""}
      </Link>
    );
  }

  async function handleStart() {
    setStarting(true);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/library/${itemId}/discussion`, {
        method: "POST",
        headers: { "x-csrf-token": csrfToken },
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(typeof payload?.error === "string" ? payload.error : "Something went wrong.");
      }
      const { threadId } = await res.json();
      router.push(`/forums/${LIBRARY_FORUM_SLUG}/${threadId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStarting(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button size="sm" variant="outline" onClick={handleStart} disabled={starting}>
        <MessageSquare className="mr-1.5 h-4 w-4" />
        {starting ? "Starting…" : "Start a Discussion"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
