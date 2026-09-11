import type { Metadata } from "next";
import Link from "next/link";
import { getAllCommunities } from "@/lib/profile-server";
import { getKnowledgeCategories } from "@/lib/library-server";
import { Button } from "@/components/ui/button";
import { ParallaxHeroImage } from "@/components/home/parallax-hero-image";
import { CommunityCategoryList } from "@/components/communities/community-category-list";
import { COMMUNITY_IMAGES, COMMUNITY_FALLBACK_IMAGE } from "@/lib/community-images";

export const metadata: Metadata = {
  title: "Communities — NASIHA",
};

// Real DB-backed content (the actual community/category list) — freezing
// it at build time would show a stale or empty (Docker build has no DB
// access) list until the next deploy, which is worse than staying
// dynamic. Kept out of app/(marketing)'s static win (objective 4) for
// that reason.
export const dynamic = "force-dynamic";

/**
 * Public counterpart to /my-communities (community-based-categorization
 * initiative, objective 7) — mirrors the /calendar-vs-/events split. No
 * personal membership state or join/leave controls here, just a browsable
 * list, since a signed-out visitor has no Profile to join with.
 */
export default async function CommunitiesPage() {
  const [communities, categories] = await Promise.all([getAllCommunities(), getKnowledgeCategories()]);
  const communitiesWithCategories = communities.map((community) => ({
    id: community.id,
    name: community.name,
    description: community.description,
    image: COMMUNITY_IMAGES[community.name] ?? COMMUNITY_FALLBACK_IMAGE,
    categories: categories.filter((category) => category.communityId === community.id),
  }));

  return (
    <main className="min-h-screen">
      <section className="relative overflow-hidden px-8 py-16 text-center text-primary-foreground">
        <ParallaxHeroImage src="/images/mycommunities.jpg" priority />
        <div className="absolute inset-0 -z-10 bg-[rgba(10,20,70,.4)]" />
        <div className="relative mx-auto max-w-[580px]">
          <h1 className="mb-3 text-[2.5rem] font-extrabold leading-[1.1] tracking-[-.02em] [text-shadow:0_2px_16px_rgba(0,10,40,.55)] md:text-[3.5rem]">
            Communities
          </h1>
          <p className="text-xl leading-[1.6] opacity-[.88] [text-shadow:0_1px_10px_rgba(0,10,40,.6)] md:text-2xl">
            NASIHA groups its Library, Events, and Forums by broad topic area — browse what&rsquo;s available below.
          </p>
        </div>
      </section>

      <section className="mx-auto flex max-w-[1120px] flex-col items-center gap-6 px-8 py-16">
        <CommunityCategoryList communities={communitiesWithCategories} />

        <div className="flex flex-col items-center gap-3 pt-6 text-center">
          <p className="text-muted-foreground">Sign in to join a community and personalize your feed.</p>
          <div className="flex gap-3">
            <Button variant="outline" asChild>
              <Link href="/sign-in">Sign in</Link>
            </Button>
            <Button asChild>
              <Link href="/join">Join NASIHA</Link>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
