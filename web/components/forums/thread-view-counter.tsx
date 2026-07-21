"use client";

import { useEffect, useState } from "react";
import { Eye, MessageSquare } from "lucide-react";
import { getCsrfToken } from "@/lib/csrf-client";

/**
 * Eye/comment counts on a forum thread (§4.13) — mirrors PostViewCounter.
 * `initialViews` is the SSR count from before this visit was recorded; on
 * mount we POST the view and swap in the fresh total from the response.
 */
export function ThreadViewCounter({
  threadId,
  initialViews,
  commentCount,
}: {
  threadId: string;
  initialViews: number;
  commentCount: number;
}) {
  const [views, setViews] = useState(initialViews);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const csrfToken = await getCsrfToken();
        const res = await fetch(`/api/forums/threads/${threadId}/view`, {
          method: "POST",
          headers: { "x-csrf-token": csrfToken },
        });
        if (!res.ok || cancelled) return;
        const payload = await res.json();
        if (typeof payload.views === "number") setViews(payload.views);
      } catch {
        // Best-effort: a failed view beacon shouldn't disrupt reading the thread.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [threadId]);

  return (
    <div className="flex items-center gap-4 text-sm text-muted-foreground">
      <span className="flex items-center gap-1.5" title="Unique visitors">
        <Eye className="h-4 w-4" />
        {views}
      </span>
      <span className="flex items-center gap-1.5" title="Replies">
        <MessageSquare className="h-4 w-4" />
        {commentCount}
      </span>
    </div>
  );
}
