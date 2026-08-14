"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, X } from "lucide-react";

/**
 * Dismissible confirmation banner for the "edit an item, land back on its
 * details page" flow shared by Library, Review Feedback, Calendar, Forums,
 * and Blog: each edit form redirects here with `?saved=1` on success. Reads
 * the param once, shows the banner, then strips it from the URL via
 * router.replace so a refresh or share link doesn't re-show it.
 */
export function SavedBanner({ message = "Changes saved." }: { message?: string }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (searchParams.get("saved") !== "1") return;
    setVisible(true);
    const params = new URLSearchParams(searchParams);
    params.delete("saved");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    // Only ever meant to fire once, on the redirect that carried `saved=1` —
    // re-running after router.replace's own searchParams update would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!visible) return null;

  return (
    <div
      role="status"
      className="mb-6 flex items-center justify-between gap-2 rounded-lg border border-success/40 bg-success/5 px-4 py-3 text-sm text-success"
    >
      <span className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        {message}
      </span>
      <button
        type="button"
        onClick={() => setVisible(false)}
        aria-label="Dismiss"
        className="text-success/70 hover:text-success"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
