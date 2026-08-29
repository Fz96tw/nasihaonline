import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth";
import { getEventsForViewer, getEventCategories } from "@/lib/events-server";
import { getAllCommunities, getDefaultCommunityFilter, getOrCreateProfile } from "@/lib/profile-server";
import { EventCard } from "@/components/events/event-card";
import { CommunityCategoryFilter } from "@/components/shared/community-category-filter";
import { ParallaxHeroImage } from "@/components/home/parallax-hero-image";
import { Reveal } from "@/components/home/reveal";

export const metadata: Metadata = {
  title: "Events — NASIHA",
};

export default async function EventsPage({
  searchParams,
}: {
  searchParams: { community?: string; category?: string };
}) {
  const user = await getSessionUser();
  const isSignedIn = Boolean(user);

  const [profile, communities, categories] = await Promise.all([
    user ? getOrCreateProfile(user.id) : null,
    getAllCommunities(),
    getEventCategories(),
  ]);
  const selectedCommunity = communities.find((c) => c.slug === searchParams.community) ?? null;
  const selectedCategory = categories.find((c) => c.slug === searchParams.category) ?? null;
  const communityIds = getDefaultCommunityFilter(profile, selectedCommunity?.id);

  const events = await getEventsForViewer(user?.id ?? null, {
    communityIds,
    categorySlug: searchParams.category,
  });

  return (
    <main className="min-h-screen">
      <section className="relative overflow-hidden px-8 py-16 text-center text-primary-foreground">
        <ParallaxHeroImage src="/images/events.jpg" priority />
        <div className="absolute inset-0 -z-10 bg-[rgba(10,20,70,.4)]" />
        <div className="relative mx-auto max-w-[580px]">
          <h1 className="mb-3 text-[2.5rem] font-extrabold leading-[1.1] tracking-[-.02em] [text-shadow:0_2px_16px_rgba(0,10,40,.55)] md:text-[3.5rem]">Events</h1>
          <p className="text-xl leading-[1.6] opacity-[.88] [text-shadow:0_1px_10px_rgba(0,10,40,.6)] md:text-2xl">
            Upcoming webinars, workshops, and roundtables from the NASIHA community.
          </p>
        </div>
      </section>

      <section className="mx-auto flex max-w-[1120px] flex-col gap-6 px-8 py-16">
        <CommunityCategoryFilter
          communities={communities}
          categories={categories}
          selectedCommunityId={selectedCommunity?.id ?? null}
          selectedCategoryId={selectedCategory?.id ?? null}
          buildHref={(next) => {
            const params = new URLSearchParams();
            const communitySlug = next.communityId
              ? communities.find((c) => c.id === next.communityId)?.slug
              : undefined;
            if (communitySlug) params.set("community", communitySlug);
            const categorySlug = next.categoryId ? categories.find((c) => c.id === next.categoryId)?.slug : undefined;
            if (categorySlug) params.set("category", categorySlug);
            const qs = params.toString();
            return qs ? `/events?${qs}` : "/events";
          }}
        />

        {events.length === 0 ? (
          <p className="text-center text-muted-foreground">
            {searchParams.community || searchParams.category
              ? "No events match your filters."
              : "No upcoming events right now — check back soon."}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((event, index) => (
              <Reveal key={event.id} index={index} hover className="h-full">
                <EventCard event={event} isSignedIn={isSignedIn} />
              </Reveal>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
