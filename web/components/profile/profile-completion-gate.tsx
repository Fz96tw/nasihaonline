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
 * Renders nothing — pathname isn't knowable in the server layout that
 * computes these two booleans, so the redirect happens here on the client
 * instead.
 */
export function ProfileCompletionGate({
  needsOnboarding,
  isFirstSignIn,
}: {
  needsOnboarding: boolean;
  isFirstSignIn: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!needsOnboarding || pathname === "/profile") return;
    router.replace(isFirstSignIn ? "/welcome" : "/profile");
  }, [needsOnboarding, isFirstSignIn, pathname, router]);

  return null;
}
