"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A sort-option icon button that also remembers the choice in a cookie
 * (one year) so it's applied as the default the next time the page is
 * visited without an explicit `?sort=` param — e.g. navigating back via a
 * plain nav link rather than clicking a sort button again.
 *
 * `icon` takes an already-rendered element (not a component reference) —
 * passing the Lucide component itself from a Server Component parent isn't
 * serializable across the client boundary.
 */
export function SortButton({
  href,
  active,
  label,
  icon,
  cookieName,
  cookieValue,
}: {
  href: string;
  active: boolean;
  label: string;
  icon: ReactNode;
  cookieName: string;
  cookieValue: string;
}) {
  return (
    <Button
      asChild
      variant={active ? "secondary" : "ghost"}
      size="icon"
      className={cn("h-8 w-8", active && "border")}
      title={label}
    >
      <Link
        href={href}
        aria-label={label}
        scroll={false}
        onClick={() => {
          document.cookie = `${cookieName}=${cookieValue}; path=/; max-age=31536000; samesite=lax`;
        }}
      >
        {icon}
      </Link>
    </Button>
  );
}
