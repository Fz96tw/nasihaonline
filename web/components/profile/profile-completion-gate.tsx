"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * Hard onboarding gate (§4.3): a member whose Profile is missing any of the
 * fields /join no longer collects up front (see
 * getMissingRequiredProfileFields in lib/profile-server.ts) can't reach any
 * other (member) page until it's complete. `needsOnboarding` is recomputed
 * from the DB on every navigation (the (member) layout re-renders per nav —
 * see its comment), so this keeps redirecting on every subsequent visit,
 * not just the first. `isFirstSignIn` only distinguishes *where* to send
 * them the very first time (the celebratory /welcome splash, outside this
 * route group) from every later incomplete visit (straight to /profile).
 *
 * `needsCommunitySelection` (community-based-categorization initiative,
 * objective 2) is a second, independent gate checked only once the first
 * one is satisfied — profile onboarding takes priority so the two never
 * race for the same redirect. Same "recomputed every nav" behavior means a
 * pre-launch member with zero ProfileCommunity rows is naturally caught by
 * it on their next visit, no separate backfill needed.
 *
 * Renders nothing — pathname isn't knowable in the server layout that
 * computes these booleans, so the redirect happens here on the client
 * instead.
 */
export function ProfileCompletionGate({
  needsOnboarding,
  isFirstSignIn,
  needsCommunitySelection,
}: {
  needsOnboarding: boolean;
  isFirstSignIn: boolean;
  needsCommunitySelection: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (needsOnboarding) {
      if (pathname !== "/profile") router.replace(isFirstSignIn ? "/welcome" : "/profile");
      return;
    }
    if (needsCommunitySelection && pathname !== "/welcome/communities") {
      router.replace("/welcome/communities");
    }
  }, [needsOnboarding, isFirstSignIn, needsCommunitySelection, pathname, router]);

  return null;
}
