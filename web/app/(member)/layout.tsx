import { redirect } from "next/navigation";
import { QueryProvider } from "@/components/providers/query-provider";
import { MemberSidebar } from "@/components/members/member-sidebar";
import { ProfileCompletionGate } from "@/components/profile/profile-completion-gate";
import { getSessionUser } from "@/lib/auth";
import { getOrCreateProfile, isProfileComplete } from "@/lib/profile-server";

/**
 * Re-executes on every navigation within (member) (layouts aren't
 * memoized across client-side nav in the App Router — each nav re-renders
 * every server component still in the tree), which is what lets
 * ProfileCompletionGate's `needsOnboarding` reflect a just-saved Profile
 * PATCH the moment the member navigates anywhere, not just on full reload.
 */
export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  // Single choke point for every route under (member): a suspended user
  // (§4.15) is blocked from all of them, without needing each page to check.
  if (user?.suspended) redirect("/account-suspended");

  // welcomeAnnouncementSentAt is null only on the request that fires the
  // first-sign-in welcome shout-out (see maybeSendWelcomeAnnouncement in
  // lib/auth.ts) — reused here as the same "first authenticated request
  // ever" signal to send a brand-new member to the /welcome splash instead
  // of straight to /profile.
  const isFirstSignIn = !!user && !user.welcomeAnnouncementSentAt;
  // Fetched once and reused for both gates below — needsCommunitySelection
  // applies to every member (including ones grandfathered past
  // needsOnboarding), so it can't reuse that flag's early-out.
  const profile = user ? await getOrCreateProfile(user.id) : null;
  // requiresProfileOnboarding is false for every member grandfathered in
  // from before the /join field-reduction (§3.1) — skip the completeness
  // check entirely for them rather than gating on fields they were never
  // asked to backfill.
  const needsOnboarding = !!user && user.requiresProfileOnboarding && !!profile && !isProfileComplete(profile);
  // The flag (not just an empty row count) distinguishes "explicitly chose
  // ALL" from "hasn't chosen yet" — without it this would re-prompt an ALL
  // member forever. Independent of needsOnboarding, so pre-launch members
  // grandfathered past that gate are still naturally caught by this one.
  const needsCommunitySelection =
    !!user && !!profile && !profile.followsAllCommunities && profile.communities.length === 0;

  return (
    <QueryProvider>
      <ProfileCompletionGate
        needsOnboarding={needsOnboarding}
        isFirstSignIn={isFirstSignIn}
        needsCommunitySelection={needsCommunitySelection}
      />
      <div className="flex flex-1">
        <MemberSidebar
          isAdmin={user?.role === "admin"}
          canModerate={user?.role === "moderator" || user?.role === "admin"}
        />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </QueryProvider>
  );
}
