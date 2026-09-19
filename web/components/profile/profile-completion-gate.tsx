"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";

/**
 * Soft onboarding nudge (§4.3): a member whose Profile is missing any of the
 * fields /join no longer collects up front (see
 * getMissingRequiredProfileFields in lib/profile-server.ts) sees a
 * persistent banner instead of being blocked from every other (member)
 * page — they can browse immediately after their first sign-in and finish
 * their profile whenever. `needsOnboarding`/`missingProfileFields` are
 * recomputed from the DB on every navigation (the (member) layout re-renders
 * per nav — see its comment), so the banner's field list stays accurate as
 * fields get saved, without a page reload. There is no first-sign-in
 * splash: a new member lands straight on /whats-new and only sees the banner.
 *
 * `needsCommunitySelection` (community-based-categorization initiative,
 * objective 2) is a second, independent gate — still a hard redirect,
 * unaffected by the profile banner above (the two never compete: the banner
 * renders in place, this one navigates away). New members start out
 * following all communities, so in practice it only catches a profile with
 * no selection at all.
 */
export function ProfileCompletionGate({
  needsOnboarding,
  needsCommunitySelection,
  missingProfileFields,
}: {
  needsOnboarding: boolean;
  needsCommunitySelection: boolean;
  missingProfileFields: string[];
}) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (needsCommunitySelection && pathname !== "/welcome/communities") {
      router.replace("/welcome/communities");
    }
  }, [needsCommunitySelection, pathname, router]);

  // The Profile page itself already surfaces the missing-fields list inline
  // (app/(member)/profile/page.tsx) — showing this banner there too would
  // be redundant on the one page where it can't help.
  if (!needsOnboarding || pathname === "/profile" || missingProfileFields.length === 0) return null;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-warning/40 bg-warning/5 px-4 py-2.5 text-sm text-warning sm:px-6"
    >
      <span className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        Finish setting up your profile ({missingProfileFields.join(", ")}) so other members can
        find and connect with you.
      </span>
      <Link href="/profile" className="shrink-0 font-medium underline underline-offset-2">
        Complete profile
      </Link>
    </div>
  );
}
