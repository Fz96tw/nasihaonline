import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Clock, Eye, MessageSquare } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { getLibraryCommunityCounts, getPublishedKnowledgeItems } from "@/lib/library-server";
import { getAllCommunities, getDefaultCommunityFilter, getOrCreateProfile } from "@/lib/profile-server";
import { CONTENT_TYPE_LABELS, LEVEL_LABELS } from "@/lib/library";
import type { LibrarySort } from "@/lib/library";
import { KnowledgeContentType, KnowledgeLevel, Role } from "@/lib/generated/prisma/enums";
import { LibraryItemCard } from "@/components/library/library-item-card";
import { BackToFeedLink } from "@/components/feed/back-to-feed-link";
import { CommunityFilterPillsNav } from "@/components/shared/community-filter-pills-nav";
import type { CommunityFilterSelection } from "@/components/shared/community-filter-pills";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ParallaxHeroImage } from "@/components/home/parallax-hero-image";
import { SortButton } from "@/components/forums/sort-button";

export const metadata: Metadata = {
  title: "Knowledge Library — NASIHA",
};

const selectClasses =
  "h-10 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

const LIBRARY_SORT_COOKIE = "library_sort";
// Shared with /calendar (COMMUNITY_FILTER_COOKIE there) — same literal
// value so a pill picked on either page persists when landing on the
// other with no explicit ?community= param, mirroring LIBRARY_SORT_COOKIE's
// own cookie-fallback pattern.
const COMMUNITY_FILTER_COOKIE = "community_filter";

const SORT_OPTIONS: { value: LibrarySort; label: string; icon: ReactNode }[] = [
  { value: "recent", label: "Most recent", icon: <Clock className="h-4 w-4" /> },
  { value: "viewed", label: "Most viewed", icon: <Eye className="h-4 w-4" /> },
  { value: "commented", label: "Most commented", icon: <MessageSquare className="h-4 w-4" /> },
];

function isLibrarySort(value: string | undefined): value is LibrarySort {
  return value === "recent" || value === "viewed" || value === "commented";
}

function buildSortHref(base: string, params: Record<string, string | undefined>, sort: LibrarySort): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) usp.set(key, value);
  }
  usp.set("sort", sort);
  return `${base}?${usp.toString()}`;
}

/**
 * /library (§4.9/§5) — member-only browse/search landing. `q` routes
 * through Meilisearch (§7.2/§9), category/type/level filter plain Postgres
 * — same "real query goes to Meilisearch, browse stays on Postgres" split
 * as /blog. Only published/flagged items ever appear (getPublishedKnowledgeItems
 * enforces this server-side).
 */
export default async function LibraryPage({
  searchParams,
}: {
  searchParams: {
    /** "all" for explicitly unfiltered, a community slug for a specific pick, or absent (defaults to "mine" — the member's own communities). */
    community?: string;
    type?: string;
    level?: string;
    q?: string;
    ref?: string;
    sort?: string;
  };
}) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const contentType = Object.values(KnowledgeContentType).includes(searchParams.type as KnowledgeContentType)
    ? (searchParams.type as KnowledgeContentType)
    : undefined;
  const level = Object.values(KnowledgeLevel).includes(searchParams.level as KnowledgeLevel)
    ? (searchParams.level as KnowledgeLevel)
    : undefined;
  const requestedSort = isLibrarySort(searchParams.sort)
    ? searchParams.sort
    : cookies().get(LIBRARY_SORT_COOKIE)?.value;
  const sort: LibrarySort = isLibrarySort(requestedSort) ? requestedSort : "recent";

  const isPrivileged = user.role === Role.moderator || user.role === Role.admin;

  const [profile, communities] = await Promise.all([getOrCreateProfile(user.id), getAllCommunities()]);
  const myCommunityIds = profile.communities.map((c) => c.community.id);

  // Flat, single-tier pill selection (My Communities / All Communities /
  // one pill per community), matching the Peer Review dashboard's
  // CommunityFilterPills — replaces the two-step Community -> Category
  // chip design now that every card already shows its own category
  // badges, same rationale Peer Review's switch documented. "all" is an
  // explicit override; a real community slug picks that one; absent means
  // "mine" (the member's own communities, or unfiltered if they follow
  // all — see getDefaultCommunityFilter).
  const requestedCommunity = searchParams.community ?? cookies().get(COMMUNITY_FILTER_COOKIE)?.value;
  const explicitCommunity = communities.find((c) => c.slug === requestedCommunity);
  const isAll = requestedCommunity === "all";
  const selected: CommunityFilterSelection = isAll ? "all" : explicitCommunity ? explicitCommunity.id : "mine";
  const communityIds = isAll ? undefined : getDefaultCommunityFilter(profile, explicitCommunity?.id);

  const [items, communityCounts] = await Promise.all([
    getPublishedKnowledgeItems({
      communityIds,
      contentType,
      level,
      q: searchParams.q,
      sort,
      userId: user.id,
      isPrivileged,
    }),
    getLibraryCommunityCounts({ userId: user.id, isPrivileged, myCommunityIds }),
  ]);

  const canEditAny = isPrivileged;

  return (
    <main className="min-h-screen">
      <section className="relative overflow-hidden px-8 py-16 text-center text-primary-foreground">
        <ParallaxHeroImage src="/images/library2.jpg" priority />
        <div className="absolute inset-0 -z-10 bg-[rgba(10,20,70,.4)]" />
        <div className="relative mx-auto max-w-[580px]">
          <h1 className="mb-3 text-[2.5rem] font-extrabold leading-[1.1] tracking-[-.02em] [text-shadow:0_2px_16px_rgba(0,10,40,.55)] md:text-[3.5rem]">Knowledge Library</h1>
          <p className="text-xl leading-[1.6] opacity-[.88] [text-shadow:0_1px_10px_rgba(0,10,40,.6)] md:text-2xl">
            Recorded lectures, articles, case studies, and guidelines shared by members.
          </p>
        </div>
      </section>

      <section className="mx-auto flex max-w-[1120px] flex-col gap-6 px-8 py-16">
        <BackToFeedLink searchParams={searchParams} />

        <div className="flex flex-wrap items-center justify-end gap-4">
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href="/library/mine">My Submissions</Link>
            </Button>
            <Button asChild>
              <Link href="/library/new">Submit Resource</Link>
            </Button>
          </div>
        </div>

        <CommunityFilterPillsNav
          communities={communities}
          myCommunityIds={myCommunityIds}
          followsAllCommunities={profile.followsAllCommunities}
          selected={selected}
          counts={communityCounts}
          cookieName={COMMUNITY_FILTER_COOKIE}
          buildHref={(selection) => {
            const params = new URLSearchParams();
            if (searchParams.type) params.set("type", searchParams.type);
            if (searchParams.level) params.set("level", searchParams.level);
            if (searchParams.q) params.set("q", searchParams.q);
            if (searchParams.ref) params.set("ref", searchParams.ref);
            if (selection === "all") {
              params.set("community", "all");
            } else if (selection !== "mine") {
              const slug = communities.find((c) => c.id === selection)?.slug;
              if (slug) params.set("community", slug);
            }
            // selection === "mine" sets no community param — that's the implicit default.
            const qs = params.toString();
            return qs ? `/library?${qs}` : "/library";
          }}
        />

        <form action="/library" method="get" className="flex flex-wrap items-end gap-3">
          {searchParams.community && <input type="hidden" name="community" value={searchParams.community} />}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="type" className="text-sm font-medium">
              Content type
            </label>
            <select id="type" name="type" defaultValue={searchParams.type ?? ""} className={selectClasses}>
              <option value="">All types</option>
              {Object.values(KnowledgeContentType).map((value) => (
                <option key={value} value={value}>
                  {CONTENT_TYPE_LABELS[value]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="level" className="text-sm font-medium">
              Career-stage level
            </label>
            <select id="level" name="level" defaultValue={searchParams.level ?? ""} className={selectClasses}>
              <option value="">All levels</option>
              {Object.values(KnowledgeLevel).map((value) => (
                <option key={value} value={value}>
                  {LEVEL_LABELS[value]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-1 gap-2">
            <Input type="search" name="q" defaultValue={searchParams.q} placeholder="Search resources…" className="max-w-sm" />
            <Button type="submit" variant="outline">
              Search
            </Button>
          </div>
        </form>

        <div className="mb-1 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {items.length} Library {items.length === 1 ? "item" : "items"} found
          </p>
          <div className="flex items-center gap-1">
            {SORT_OPTIONS.map((option) => (
              <SortButton
                key={option.value}
                href={buildSortHref(
                  "/library",
                  {
                    community: searchParams.community,
                    type: searchParams.type,
                    level: searchParams.level,
                    q: searchParams.q,
                    ref: searchParams.ref,
                  },
                  option.value,
                )}
                active={sort === option.value}
                label={option.label}
                icon={option.icon}
                cookieName={LIBRARY_SORT_COOKIE}
                cookieValue={option.value}
              />
            ))}
          </div>
        </div>
        <div className="mb-4 flex justify-end">
          <span className="text-xs text-muted-foreground">
            Sorted by {SORT_OPTIONS.find((option) => option.value === sort)?.label.toLowerCase()}
          </span>
        </div>

        {items.length === 0 ? (
          <p className="rounded-[10px] border p-8 text-center text-muted-foreground">
            {searchParams.q || searchParams.community || contentType || level
              ? "No resources match your filters."
              : "No resources have been published yet — check back soon."}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <LibraryItemCard
                key={item.id}
                item={item}
                canEdit={canEditAny || item.contributor.id === user.id}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
