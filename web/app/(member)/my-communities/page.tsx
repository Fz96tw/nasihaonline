import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getAllCommunities, getOrCreateProfile } from "@/lib/profile-server";
import { CommunitySelectionForm } from "@/components/profile/community-selection-form";
import { ParallaxHeroImage } from "@/components/home/parallax-hero-image";

export const metadata: Metadata = {
  title: "My Communities — NASIHA",
};

/**
 * The persistent, nav-reachable home for managing community membership —
 * unlike /welcome/communities (a one-time onboarding step outside the
 * (member) layout), this lives inside it and can be revisited anytime.
 */
export default async function MyCommunitiesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const [profile, communities] = await Promise.all([getOrCreateProfile(user.id), getAllCommunities()]);
  const joinedIds = new Set(profile.communities.map((c) => c.community.id));
  const yourCommunities = profile.followsAllCommunities
    ? communities
    : communities.filter((c) => joinedIds.has(c.id));
  const otherCommunities = profile.followsAllCommunities ? [] : communities.filter((c) => !joinedIds.has(c.id));

  return (
    <main className="min-h-screen">
      <section className="relative overflow-hidden px-8 py-16 text-center text-primary-foreground">
        <ParallaxHeroImage src="/images/mycommunities.jpg" priority />
        <div className="absolute inset-0 -z-10 bg-[rgba(10,20,70,.4)]" />
        <div className="relative mx-auto max-w-[580px]">
          <h1 className="mb-3 text-[2.5rem] font-extrabold leading-[1.1] tracking-[-.02em] [text-shadow:0_2px_16px_rgba(0,10,40,.55)] md:text-[3.5rem]">
            My Communities
          </h1>
          <p className="text-xl leading-[1.6] opacity-[.88] [text-shadow:0_1px_10px_rgba(0,10,40,.6)] md:text-2xl">
            Communities group NASIHA&rsquo;s content by broad topic area, so your Library, Events, and Forum
            browsing defaults to what you care about.
          </p>
        </div>
      </section>

      <section className="mx-auto flex max-w-[720px] flex-col gap-10 px-8 py-16">
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Your Communities</h2>
          {profile.followsAllCommunities ? (
            <p className="text-sm text-muted-foreground">
              You&rsquo;re following all communities — you&rsquo;ll see content from every one below as they&rsquo;re
              added.
            </p>
          ) : yourCommunities.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              You haven&rsquo;t joined any communities yet — pick some below.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {yourCommunities.map((community) => (
                <li key={community.id} className="rounded-md border p-3">
                  <p className="text-sm font-medium">{community.name}</p>
                  {community.description && (
                    <p className="mt-1 text-sm text-muted-foreground">{community.description}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Edit Membership</h2>
          <CommunitySelectionForm
            communities={communities.map((c) => ({ id: c.id, name: c.name }))}
            initialSelectedIds={Array.from(joinedIds)}
            initialFollowsAll={profile.followsAllCommunities}
            redirectTo="/my-communities"
          />
        </div>

        {otherCommunities.length > 0 && (
          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Other Communities</h2>
            <ul className="flex flex-col gap-2">
              {otherCommunities.map((community) => (
                <li key={community.id} className="rounded-md border p-3">
                  <p className="text-sm font-medium">{community.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {community.description ?? "No description yet."}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </main>
  );
}
