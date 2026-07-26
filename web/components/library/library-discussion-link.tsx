"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCsrfToken } from "@/lib/csrf-client";

/**
 * On-demand "Start a Discussion" button on /library/[id] (§4.9). Once a
 * thread exists it's rendered inline further down the page (see
 * ForumThreadView usage in the page component), so this renders nothing
 * once initialThreadId is set — starting one just refreshes the page so
 * the newly created thread appears embedded below.
 */
export function LibraryDiscussionLink({
  itemId,
  initialThreadId,
}: {
  itemId: string;
  initialThreadId: string | null;
}) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (initialThreadId) {
    return null;
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
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
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
