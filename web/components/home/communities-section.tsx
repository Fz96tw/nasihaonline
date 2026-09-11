import Link from "next/link";
import { Reveal } from "@/components/home/reveal";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getAllCommunities } from "@/lib/profile-server";
import { CommunityAccordionStack } from "@/components/communities/community-accordion-stack";
import { COMMUNITY_IMAGES, COMMUNITY_FALLBACK_IMAGE } from "@/lib/community-images";

// Matches the section's own layout shape so the swap-in doesn't shift
// layout — same rationale as HeroStatsSkeleton in hero-section.tsx.
export function CommunitiesSectionSkeleton() {
  return (
    <section className="px-8 py-24">
      <div className="mx-auto max-w-[1120px]">
        <div className="mb-10 flex flex-col items-center gap-3">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-5 w-96 max-w-full" />
        </div>
        <Skeleton className="mx-auto h-[480px] w-full max-w-[1120px] rounded-xl sm:h-[230px] md:h-[260px]" />
      </div>
    </section>
  );
}

/**
 * DB-backed, so isolated behind its own <Suspense> boundary in page.tsx —
 * same rationale as HeroStats (hero-stats.tsx) — the rest of the landing
 * page shouldn't wait on this fetch to stream. The homepage is statically
 * generated (objective 4) and Docker's `next build` step has no network
 * path to the database, so this falls back to an empty list rather than
 * failing the whole build — production always has a reachable DB at
 * request time, so real visitors never see this fallback; the tradeoff
 * (accepted deliberately) is that this list reflects build time, not live
 * data, until the next deploy.
 */
export async function CommunitiesSection() {
  const communities = await getAllCommunities().catch(() => []);

  return (
    <section className="px-8 py-24">
      <div className="mx-auto max-w-[1120px]">
        <Reveal className="mb-10 text-center">
          <p className="mb-3 text-sm font-bold uppercase tracking-[.1em] text-primary">Explore by Topic</p>
          <h2 className="text-3xl font-extrabold tracking-[-.02em] md:text-4xl">Find Your Community</h2>
          <p className="mx-auto mt-4 max-w-[640px] text-lg text-muted-foreground">
            NASIHA groups its Library, Events, and Forums by broad topic area — join the ones you care about.
          </p>
        </Reveal>
        <CommunityAccordionStack
          communities={communities.map((community) => ({
            id: community.id,
            name: community.name,
            description: community.description,
            image: COMMUNITY_IMAGES[community.name] ?? COMMUNITY_FALLBACK_IMAGE,
          }))}
        />
        <Reveal className="mt-10 text-center">
          <Button variant="outline" size="lg" asChild>
            <Link href="/communities">Learn more</Link>
          </Button>
        </Reveal>
      </div>
    </section>
  );
}
