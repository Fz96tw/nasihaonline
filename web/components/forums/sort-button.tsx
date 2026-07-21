"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A sort-option icon button that also remembers the choice in a cookie
 * (one year) so it's applied as the default the next time the page is
 * visited without an explicit `?sort=` param — e.g. navigating back via a
 * plain nav link rather than clicking a sort button again.
 */
export function SortButton({
  href,
  active,
  label,
  icon: Icon,
  cookieName,
  cookieValue,
}: {
  href: string;
  active: boolean;
  label: string;
  icon: LucideIcon;
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
        onClick={() => {
          document.cookie = `${cookieName}=${cookieValue}; path=/; max-age=31536000; samesite=lax`;
        }}
      >
        <Icon className="h-4 w-4" />
      </Link>
    </Button>
  );
}
