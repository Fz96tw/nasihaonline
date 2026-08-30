"use client";

import { useRouter } from "next/navigation";
import { Checkbox } from "@/components/ui/checkbox";

/** Same cookie name the page reads server-side to fall back to when the URL has no explicit `myCommunities`. */
export const MY_COMMUNITIES_COOKIE = "whats_new_my_communities";

/**
 * "Show only my communities" — scopes the /whats-new feed (browsing or
 * search results, same toggle for both) to the member's own communities.
 * Moved here from the header search row (that row is just the input now) —
 * a checkbox that filters results reads more naturally next to the results
 * than floating in the sticky header.
 *
 * Unchecked by default; remembers its setting across searches via a cookie
 * (same pattern as SortButton/CommunityFilterCookieLink) — `href` already
 * carries the flipped value explicitly so the click's navigation and the
 * cookie agree immediately, and the cookie is what makes a *later* fresh
 * search (typed in the header, which knows nothing about this toggle)
 * still honor the last-set preference.
 */
export function MyCommunitiesCheckbox({ checked, href }: { checked: boolean; href: string }) {
  const router = useRouter();

  return (
    <label className="flex w-fit cursor-pointer items-center gap-1.5 text-sm text-muted-foreground">
      <Checkbox
        checked={checked}
        onCheckedChange={(next) => {
          document.cookie = `${MY_COMMUNITIES_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
          router.push(href);
        }}
      />
      Show only my communities
    </label>
  );
}
