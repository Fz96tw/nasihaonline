import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Flame, Clock, ListOrdered, ArrowDownAZ } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { getForumCategories } from "@/lib/forums-server";
import { getAllCommunities, getOrCreateProfile } from "@/lib/profile-server";
import { CommunityFilterPillsNav } from "@/components/shared/community-filter-pills-nav";
import type { CommunityFilterSelection } from "@/components/shared/community-filter-pills";
import { Badge } from "@/components/ui/badge";
import { ParallaxHeroImage } from "@/components/home/parallax-hero-image";
import { Reveal } from "@/components/home/reveal";
import { SortButton } from "@/components/forums/sort-button";
import { Role } from "@/lib/generated/prisma/enums";
import type { ForumCategory } from "@/lib/forums";

export const metadata: Metadata = {
  title: "Forums — NASIHA",
};

type ForumSort = "az" | "featured" | "active" | "recent";

const FORUM_SORT_COOKIE = "forums_sort";
// Own cookie, independent of /library's and /calendar's (confirmed with
// user: each page remembers its own last pick, not a shared value).
const COMMUNITY_FILTER_COOKIE = "forums_community_filter";

/**
 * community-based-categorization initiative, objective 6 — which forum
 * tiles the current pill selection shows. A generic (untouched) forum
 * always matches "mine" or a specific community pill, same "universal"
 * rule Calendar/Events use for community-less content — but never a bare
 * "other" selection, which shows nothing until a specific community pill
 * underneath it is picked (two-level filter, no more unfiltered "All
 * Communities" state, confirmed with user). This is purely a display
 * narrowing *within* the already-access-filtered list getForumCategories
 * returns — it never un-hides a forum the viewer can't access.
 */
function matchesCommunityFilter(
  communityId: string | null,
  selection: CommunityFilterSelection,
  myCommunityIds: string[],
): boolean {
  if (selection === "other") return false;
  if (communityId === null) return true;
  const targetIds = selection === "mine" ? myCommunityIds : [selection];
  return targetIds.includes(communityId);
}

/**
 * Pill counts show total threads across the matching forums, not the
 * number of matching forums — a member scanning pills cares how much
 * discussion is in a community, not how many forum categories it happens
 * to be split into. "other" is informational only (the tab itself shows
 * nothing until a specific pill is picked) — every thread in a forum
 * that doesn't already match "mine".
 */
function computeCommunityCounts(
  forums: { communityId: string | null; threadCount: number }[],
  communities: { id: string }[],
  myCommunityIds: string[],
): Map<string, number> {
  const counts = new Map<string, number>();
  const sumThreads = (matching: typeof forums) => matching.reduce((sum, forum) => sum + forum.threadCount, 0);
  const mineMatches = forums.filter((forum) => matchesCommunityFilter(forum.communityId, "mine", myCommunityIds));
  counts.set("mine", sumThreads(mineMatches));
  counts.set("other", sumThreads(forums) - sumThreads(mineMatches));
  for (const community of communities) {
    counts.set(
      community.id,
      sumThreads(forums.filter((forum) => matchesCommunityFilter(forum.communityId, community.id, myCommunityIds))),
    );
  }
  return counts;
}

const SORT_OPTIONS: { value: ForumSort; label: string; icon: ReactNode }[] = [
  { value: "az", label: "A–Z", icon: <ArrowDownAZ className="h-4 w-4" /> },
  { value: "featured", label: "Featured order", icon: <ListOrdered className="h-4 w-4" /> },
  { value: "recent", label: "Most recent", icon: <Clock className="h-4 w-4" /> },
  { value: "active", label: "Most active", icon: <Flame className="h-4 w-4" /> },
];

function isForumSort(value: string | undefined): value is ForumSort {
  return value === "az" || value === "featured" || value === "active" || value === "recent";
}

function ForumTile({ forum, index }: { forum: ForumCategory; index: number }) {
  return (
    <Reveal index={index}>
      <Link
        href={`/forums/${forum.slug}`}
        className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/50"
      >
        <div className="min-w-0 flex-1">
          <div className="font-medium">{forum.name}</div>
          {forum.description && <div className="truncate text-sm text-muted-foreground">{forum.description}</div>}
        </div>
        <Badge variant="neutral" className="shrink-0">
          {forum.threadCount} {forum.threadCount === 1 ? "thread" : "threads"}
        </Badge>
      </Link>
    </Reveal>
  );
}

function ForumTileGrid({ forums }: { forums: ForumCategory[] }) {
  return (
    <div className="divide-y rounded-lg border">
      {forums.map((forum, index) => (
        <ForumTile key={forum.id} forum={forum} index={index} />
      ))}
    </div>
  );
}

/**
 * /forums (§4.13) — member-only category list, sourced from the seeded
 * Forum rows. "The primary space for asynchronous, community-wide
 * interaction" per Member_Communications.md. Sort buttons re-order the same
 * fetched list client-side-free via a `?sort=` param — cheap given there
 * are only a handful of categories, no need for a real sort UI. Defaults
 * to alphabetical (A–Z).
 */
export default async function ForumsPage({
  searchParams,
}: {
  searchParams: { sort?: string; community?: string };
}) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const isPrivileged = user.role === Role.moderator || user.role === Role.admin;

  const requestedSort = isForumSort(searchParams.sort) ? searchParams.sort : cookies().get(FORUM_SORT_COOKIE)?.value;
  const sort: ForumSort = isForumSort(requestedSort) ? requestedSort : "az";

  const [accessibleForums, profile, communities] = await Promise.all([
    getForumCategories(user.id, isPrivileged),
    getOrCreateProfile(user.id),
    getAllCommunities(),
  ]);
  const myCommunityIds = profile.communities.map((c) => c.community.id);

  const requestedCommunity = searchParams.community ?? cookies().get(COMMUNITY_FILTER_COOKIE)?.value;
  const explicitCommunity = communities.find((c) => c.slug === requestedCommunity);
  const isOtherCommunities = requestedCommunity === "other";
  const selectedCommunity: CommunityFilterSelection = isOtherCommunities
    ? "other"
    : explicitCommunity
      ? explicitCommunity.id
      : "mine";
  const communityCounts = computeCommunityCounts(accessibleForums, communities, myCommunityIds);

  const forums = accessibleForums.filter((forum) =>
    matchesCommunityFilter(forum.communityId, selectedCommunity, myCommunityIds),
  );

  // Sections are always fully expanded (no Accordion) — sort only re-orders
  // forums *within* a section, never re-orders/collapses the sections
  // themselves, so scanning "which communities have forums" never requires
  // opening anything. Misc (community-less) forums get their own section,
  // pinned first; the rest are ordered alphabetically by community name.
  const sortForums = (list: ForumCategory[]) =>
    [...list].sort((a, b) => {
      if (sort === "az") return a.name.localeCompare(b.name);
      if (sort === "active") return (b.postCount ?? 0) - (a.postCount ?? 0);
      if (sort === "recent") return (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? "");
      return 0; // "featured" — keep displayOrder as returned by getForumCategories
    });
  const miscForums = sortForums(forums.filter((forum) => forum.communityId === null));
  const communityGroups = communities
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((community) => ({
      community,
      forums: sortForums(forums.filter((forum) => forum.communityId === community.id)),
    }))
    .filter((group) => group.forums.length > 0);

  return (
    <main className="min-h-screen">
      <section className="relative overflow-hidden px-8 py-16 text-center text-primary-foreground">
        <ParallaxHeroImage src="/images/forums2.jpg" priority />
        <div className="absolute inset-0 -z-10 bg-[rgba(10,20,70,.4)]" />
        <div className="relative mx-auto max-w-[580px]">
          <h1 className="mb-3 text-[2.5rem] font-extrabold leading-[1.1] tracking-[-.02em] [text-shadow:0_2px_16px_rgba(0,10,40,.55)] md:text-[3.5rem]">Forums</h1>
          <p className="text-xl leading-[1.6] opacity-[.88] [text-shadow:0_1px_10px_rgba(0,10,40,.6)] md:text-2xl">
            A place to ask questions, share reflections, and connect with the community.
          </p>
        </div>
      </section>

      <section className="mx-auto flex max-w-[1120px] flex-col gap-6 px-8 py-16">
        <CommunityFilterPillsNav
          communities={communities}
          myCommunityIds={myCommunityIds}
          followsAllCommunities={profile.followsAllCommunities}
          selected={selectedCommunity}
          counts={communityCounts}
          cookieName={COMMUNITY_FILTER_COOKIE}
          buildHref={(selection) => {
            const params = new URLSearchParams();
            if (searchParams.sort) params.set("sort", searchParams.sort);
            if (selection === "other") {
              params.set("community", "other");
            } else if (selection !== "mine") {
              const slug = communities.find((c) => c.id === selection)?.slug;
              if (slug) params.set("community", slug);
            }
            const qs = params.toString();
            return qs ? `/forums?${qs}` : "/forums";
          }}
        />

        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-1">
            <span className="mr-1 text-sm text-muted-foreground">Sort:</span>
            {SORT_OPTIONS.map((option) => {
              const params = new URLSearchParams();
              params.set("sort", option.value);
              if (searchParams.community) params.set("community", searchParams.community);
              return (
                <SortButton
                  key={option.value}
                  href={`/forums?${params.toString()}`}
                  active={sort === option.value}
                  label={option.label}
                  icon={option.icon}
                  cookieName={FORUM_SORT_COOKIE}
                  cookieValue={option.value}
                />
              );
            })}
          </div>
          <span className="text-xs text-muted-foreground">
            Sorted by {SORT_OPTIONS.find((option) => option.value === sort)?.label}
          </span>
        </div>
        {selectedCommunity === "other" && miscForums.length === 0 && communityGroups.length === 0 ? (
          <p className="rounded-[10px] border p-8 text-center text-muted-foreground">
            Pick a community above to see its forums.
          </p>
        ) : (
          <div className="flex flex-col gap-10">
            {miscForums.length > 0 && (
              <section>
                <h2 className="mb-4 text-lg font-semibold">Misc Groups</h2>
                <ForumTileGrid forums={miscForums} />
              </section>
            )}
            {communityGroups.map((group) => (
              <section key={group.community.id}>
                <h2 className="mb-4 text-lg font-semibold">{group.community.name}</h2>
                <ForumTileGrid forums={group.forums} />
              </section>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
