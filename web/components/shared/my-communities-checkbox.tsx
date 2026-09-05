"use client";

import { useRouter } from "next/navigation";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

/**
 * "Show only my communities" — a bare checkbox control shared by every
 * page that scopes its content to the member's own communities (originally
 * built for the /whats-new feed, now reused by Calendar/Library/Forums'
 * CommunityFilterPillsNav and Peer Review's CommunityFilterPills' own
 * inline checkbox mirrors this same markup/label).
 *
 * `cookieName` is passed in rather than exported from here, since a plain
 * value exported from a "use client" module isn't safely importable into
 * the Server Component page that needs it for its own cookie-fallback
 * read; it just resolves to `{}` there instead of the string. `href`
 * already carries the flipped value explicitly so the click's navigation
 * and the cookie agree immediately, and the cookie is what makes a *later*
 * fresh navigation (e.g. a plain nav link, which knows nothing about this
 * toggle) still honor the last-set preference.
 *
 * `checkedValue`/`uncheckedValue` default to "1"/"0" (whats-new's own
 * boolean cookie); Calendar/Library/Forums instead pass "mine"/"" since
 * their cookie also doubles as the specific-community-pill selection, and
 * an empty string reads the same as an absent cookie (unrestricted).
 */
export function MyCommunitiesCheckbox({
  checked,
  href,
  cookieName,
  checkedValue = "1",
  uncheckedValue = "0",
  count,
}: {
  checked: boolean;
  href: string;
  cookieName: string;
  checkedValue?: string;
  uncheckedValue?: string;
  count?: number;
}) {
  const router = useRouter();

  return (
    <label className="flex w-fit cursor-pointer items-center gap-1.5 text-sm text-muted-foreground">
      <Checkbox
        checked={checked}
        onCheckedChange={(next) => {
          document.cookie = `${cookieName}=${next ? checkedValue : uncheckedValue}; path=/; max-age=31536000; samesite=lax`;
          router.push(href, { scroll: false });
        }}
      />
      Show only my communities
      {count !== undefined && (
        <span className={cn("text-[0.65rem] tabular-nums", checked ? "text-foreground/70" : "text-muted-foreground/70")}>
          {count}
        </span>
      )}
    </label>
  );
}
