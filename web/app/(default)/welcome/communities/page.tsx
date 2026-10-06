import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getAllCommunities, getOrCreateProfile, getSuggestedCommunityIds } from "@/lib/profile-server";
import { CommunitySelectionForm } from "@/components/profile/community-selection-form";

export const metadata: Metadata = {
  title: "Choose Your Communities — NASIHA",
};

/**
 * Community-selection page (community-based-categorization initiative,
 * objective 2) — reached via the header search row's "edit" affordance.
 * No longer a forced step: members default to following every community
 * (getOrCreateProfile heals a never-chosen profile to "all").
 * Deliberately outside the (member) route group, same un-sidebared style
 * as /welcome.
 */
export default async function ChooseCommunitiesPage({
  searchParams,
}: {
  searchParams: { redirectTo?: string };
}) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const [profile, communities] = await Promise.all([getOrCreateProfile(user.id), getAllCommunities()]);
  const alreadyChosen = profile.followsAllCommunities || profile.communities.length > 0;
  const suggestedIds = alreadyChosen
    ? profile.communities.map((c) => c.community.id)
    : await getSuggestedCommunityIds(profile.interestAreas);

  // Only trust a redirectTo the member could actually reach (same-origin
  // path) — never an absolute/external URL passed through the query string.
  const redirectTo =
    searchParams.redirectTo?.startsWith("/") && !searchParams.redirectTo.startsWith("//")
      ? searchParams.redirectTo
      : "/dashboard";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="flex max-w-md flex-col gap-2 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Choose Your Communities</h1>
        <p className="text-sm text-muted-foreground">
          Communities group NASIHA&rsquo;s content by broad topic area, so your Library, Events, and
          Forum browsing can default to what you care about. Pick one or more, or follow every
          community — you can change this anytime.
        </p>
      </div>
      <div className="w-full max-w-md">
        <CommunitySelectionForm
          communities={communities.map((c) => ({ id: c.id, name: c.name }))}
          initialSelectedIds={suggestedIds}
          initialFollowsAll={profile.followsAllCommunities}
          redirectTo={redirectTo}
        />
      </div>
    </main>
  );
}
