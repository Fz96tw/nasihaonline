"use client";

import { useEffect, useState } from "react";
import { Eye } from "lucide-react";
import { getCsrfToken } from "@/lib/csrf-client";

/**
 * Eye-icon unique-visitor count on a Library item detail page (§4.9) —
 * mirrors EventViewCounter. `initialViews` is the SSR count from before
 * this visit was recorded; on mount we POST the view and swap in the fresh
 * total from the response.
 */
export function LibraryViewCounter({
  itemId,
  initialViews,
  record = true,
}: {
  itemId: string;
  initialViews: number;
  /** false for a signed-out reader — the view route is member-only, and its 401 would trip SessionExpiryGuard's redirect to /sign-in. */
  record?: boolean;
}) {
  const [views, setViews] = useState(initialViews);

  useEffect(() => {
    if (!record) return;
    let cancelled = false;

    (async () => {
      try {
        const csrfToken = await getCsrfToken();
        const res = await fetch(`/api/library/${itemId}/view`, {
          method: "POST",
          headers: { "x-csrf-token": csrfToken },
        });
        if (!res.ok || cancelled) return;
        const payload = await res.json();
        if (typeof payload.views === "number") setViews(payload.views);
      } catch {
        // Best-effort: a failed view beacon shouldn't disrupt viewing the resource.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [itemId, record]);

  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground" title="Unique visitors">
      <Eye className="h-3.5 w-3.5" />
      {views}
    </span>
  );
}
