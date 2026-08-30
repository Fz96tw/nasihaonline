import Link from "next/link";
import { Reveal } from "@/components/home/reveal";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getAllCommunities } from "@/lib/profile-server";

// Matches the section's own grid shape so the swap-in doesn't shift layout —
// same rationale as HeroStatsSkeleton in hero-section.tsx.
export function CommunitiesSectionSkeleton() {
  return (
    <section className="px-8 py-24">
      <div className="mx-auto max-w-[1120px]">
        <div className="mb-10 flex flex-col items-center gap-3">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-5 w-96 max-w-full" />
        </div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * DB-backed, so isolated behind its own <Suspense> boundary in page.tsx —
 * same rationale as HeroStats (hero-stats.tsx) — the rest of the landing
 * page shouldn't wait on this fetch to stream.
 */
export async function CommunitiesSection() {
  const communities = await getAllCommunities();

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
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {communities.map((community, index) => (
            <Reveal key={community.id} index={index} hover className="h-full">
              <div className="flex h-full flex-col gap-2 rounded-xl border bg-card p-6 text-center shadow-sm">
                <p className="font-bold">{community.name}</p>
                <p className="text-sm leading-[1.6] text-muted-foreground">
                  {community.description ?? "No description yet."}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal className="mt-10 text-center">
          <Button variant="default" size="lg" asChild>
            <Link href="/communities">Browse All Communities</Link>
          </Button>
        </Reveal>
      </div>
    </section>
  );
}
