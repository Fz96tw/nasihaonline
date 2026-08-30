import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Rss } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { getFeedPage } from "@/lib/feed-server";
import { FEED_TYPES, FEED_TYPE_LABELS, isFeedItemType } from "@/lib/feed";
import { FeedList } from "@/components/feed/feed-list";
import { MyCommunitiesCheckbox } from "@/components/shared/my-communities-checkbox";
import { cn } from "@/lib/utils";
import { getAllCommunities, getMemberCommunityIdsForFiltering, getOrCreateProfile } from "@/lib/profile-server";

export const metadata: Metadata = {
  title: "What's New — NASIHA",
};

// Defined here (not exported from the "use client" MyCommunitiesCheckbox
// module, passed down instead as a prop) — a plain value exported from a
// "use client" file resolves to `{}` rather than the real string when
// imported into a Server Component, since the client-module proxy replaces
// every export, not just components. Same pattern as
// library/page.tsx's LIBRARY_SORT_COOKIE / calendar/page.tsx's
// COMMUNITY_FILTER_COOKIE.
const MY_COMMUNITIES_COOKIE = "whats_new_my_communities";

/** /whats-new — the post-sign-in landing page: a merged, newest-first feed across Events/Blog/Library/Forums/Announcements. */
export default async function WhatsNewPage({
  searchParams,
}: {
  searchParams: { type?: string; q?: string; myCommunities?: string };
}) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const activeType = isFeedItemType(searchParams.type) ? searchParams.type : undefined;
  const q = searchParams.q?.trim() || undefined;
  // "Show only my communities" — explicit "1"/"0" in the URL (from clicking
  // the checkbox, or a link that preserves it) always wins; otherwise fall
  // back to the cookie so the setting survives a brand-new search typed
  // into the header, which knows nothing about this toggle. Unchecked
  // (false) when neither is set.
  const myCommunities =
    searchParams.myCommunities === "1"
      ? true
      : searchParams.myCommunities === "0"
        ? false
        : cookies().get(MY_COMMUNITIES_COOKIE)?.value === "1";
  const [profile, communities] = await Promise.all([getOrCreateProfile(user.id), getAllCommunities()]);
  const communityIds = getMemberCommunityIdsForFiltering(profile, myCommunities);
  // Same rationale as CommunityFilterPills(Nav): once the member already
  // belongs to every community, "Show only my communities" is a no-op, so
  // hide it rather than leave a checkbox that can't change anything.
  const joinedAllCommunities =
    profile.followsAllCommunities || (communities.length > 0 && profile.communities.length >= communities.length);
  const { items, nextCursor, hasMore, totalCount, countsByType } = await getFeedPage({
    cursor: null,
    types: activeType ? [activeType] : undefined,
    viewerId: user.id,
    viewerRole: user.role,
    q,
    communityIds,
  });

  const filterLinkClasses = (isActive: boolean) =>
    cn(
      "rounded-full border px-3 py-1 text-sm font-medium transition-colors",
      isActive
        ? "border-primary bg-primary text-primary-foreground"
        : "border-input text-muted-foreground hover:bg-accent/50 hover:text-foreground",
    );

  // Preserves the active search query and myCommunities toggle across a
  // type-pill click (and vice versa) — the pills, the search form, and the
  // communities checkbox all filter the same feed together, not as
  // separate, mutually-clearing views.
  const filterHref = (type?: string) => {
    const params = new URLSearchParams();
    if (type) params.set("type", type);
    if (q) params.set("q", q);
    if (myCommunities) params.set("myCommunities", "1");
    const qs = params.toString();
    return qs ? `/whats-new?${qs}` : "/whats-new";
  };

  const myCommunitiesHref = (() => {
    const params = new URLSearchParams();
    if (activeType) params.set("type", activeType);
    if (q) params.set("q", q);
    params.set("myCommunities", myCommunities ? "0" : "1");
    return `/whats-new?${params.toString()}`;
  })();

  // The Inbox pill only makes sense while a search is active (getFeedPage's
  // inbox branch never returns anything without a query) — hidden outside
  // search mode rather than left clickable into a dead, unexplained "0
  // results" state. In search mode, every pill is further narrowed to only
  // those types with at least one match (via countsByType) — same "don't
  // offer a dead click" rationale, extended to every type, not just Inbox —
  // except the currently-active pill, kept visible even at zero results so
  // there's still an obvious way back to "All". FEED_TYPES itself stays
  // canonical/unfiltered everywhere else (feed-server.ts, the API route) —
  // this only changes what renders here.
  const visiblePillTypes = FEED_TYPES.filter((type) => {
    if (type === "inbox" && !q) return false;
    if (!countsByType) return true;
    if (type === activeType) return true;
    return (countsByType[type] ?? 0) > 0;
  });

  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-6 px-[2px] py-8 sm:px-8">
      <div className="flex flex-col gap-1.5">
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          {q ? (
            `${totalCount ?? 0} search result${totalCount === 1 ? "" : "s"} for: "${q}"`
          ) : (
            <>
              <Rss className="h-7 w-7" aria-hidden="true" />
              What&apos;s New
            </>
          )}
        </h1>

        {!joinedAllCommunities && (
          <MyCommunitiesCheckbox checked={myCommunities} href={myCommunitiesHref} cookieName={MY_COMMUNITIES_COOKIE} />
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href={filterHref()} className={filterLinkClasses(activeType === undefined)}>
          All
        </Link>
        {visiblePillTypes.map((type) => (
          <Link key={type} href={filterHref(type)} className={filterLinkClasses(activeType === type)}>
            {FEED_TYPE_LABELS[type]}
          </Link>
        ))}
      </div>

      <div className="rounded-[10px] border">
        <FeedList
          key={`${activeType ?? "all"}-${q ?? ""}-${myCommunities}`}
          initialItems={items}
          initialCursor={nextCursor}
          initialHasMore={hasMore}
          activeType={activeType}
          q={q}
          myCommunities={myCommunities}
        />
      </div>
    </main>
  );
}
