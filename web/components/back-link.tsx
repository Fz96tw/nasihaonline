"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

/**
 * Generic browser-back control, used on pages reachable from more than one
 * place (feed, search, notifications, a list view, ...) so there's no
 * single "correct" fixed destination to hardcode. Falls back to
 * fallbackHref only when there's no in-app history to return to (page
 * opened directly/in a new tab), since router.back() alone would silently
 * no-op in that case.
 */
export function BackLink({ fallbackHref, className }: { fallbackHref: string; className?: string }) {
  const router = useRouter();

  return (
    <Link
      href={fallbackHref}
      onClick={(event) => {
        event.preventDefault();
        if (window.history.length > 1) {
          router.back();
        } else {
          router.push(fallbackHref);
        }
      }}
      className={className ?? "inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"}
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      Back
    </Link>
  );
}
