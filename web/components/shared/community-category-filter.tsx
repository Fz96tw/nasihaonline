"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

const chipClasses = (active: boolean, muted?: boolean) =>
  cn(
    "rounded-full px-3 py-1 text-sm font-medium transition-colors",
    active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70",
    muted && !active && "opacity-50",
  );

function Chip({
  href,
  onClick,
  active,
  muted,
  children,
}: {
  href?: string;
  onClick?: () => void;
  active: boolean;
  muted?: boolean;
  children: React.ReactNode;
}) {
  if (href) {
    return (
      <Link href={href} scroll={false} className={chipClasses(active, muted)}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={chipClasses(active, muted)}>
      {children}
    </button>
  );
}

/**
 * Two-step community -> category browse filter (community-based-
 * categorization initiative, objective 3, extended in objective 4): a row
 * of Community chips (single-select), revealing that community's category
 * chips once picked. Supports two mutually-exclusive interaction modes:
 *
 * - `buildHref` (nav mode) — plain next/link navigation, no client state,
 *   for a server-rendered/URL-param-driven page like Library's (shareable
 *   URLs matter there). The caller owns its own page's other params
 *   (`?type=`/`?level=`/`?q=`) and maps a category id to whatever URL
 *   shape it wants (e.g. a readable `?category=slug`).
 * - `onSelectCommunity`/`onSelectCategory` (local-state mode) — plain
 *   buttons calling back into the caller's own useState, for a client
 *   component filtering already-loaded data with no URL round trip (e.g.
 *   the Peer Review dashboard's tabs, which don't URL-drive their own tab
 *   selection either).
 *
 * Both modes identify categories/communities by id, not slug — a nav-mode
 * caller that wants readable URLs resolves id<->slug itself (it already
 * has the full categories list to do so), keeping this component's public
 * contract uniform either way.
 *
 * Default-filter-state behavior (no explicit selection scoping to the
 * member's own communities) is NOT this component's job — it only renders
 * the current selection it's given. See getDefaultCommunityFilter in
 * lib/profile-server.ts for that, applied once by each consuming page's
 * data query rather than duplicated here.
 */
type NavMode = {
  buildHref: (next: { communityId: string | null; categoryId: string | null }) => string;
  onSelectCommunity?: undefined;
  onSelectCategory?: undefined;
};
type LocalStateMode = {
  buildHref?: undefined;
  onSelectCommunity: (communityId: string | null) => void;
  onSelectCategory: (categoryId: string | null) => void;
};

export function CommunityCategoryFilter({
  communities,
  categories,
  selectedCommunityId,
  selectedCategoryId,
  categoryCounts,
  ...mode
}: {
  communities: { id: string; name: string }[];
  categories: { id: string; name: string; communityId: string }[];
  selectedCommunityId: string | null;
  selectedCategoryId: string | null;
  /** Optional per-category item count, shown the same way Library's original chips did. */
  categoryCounts?: Map<string, number>;
} & (NavMode | LocalStateMode)) {
  const categoriesForSelectedCommunity = selectedCommunityId
    ? categories.filter((category) => category.communityId === selectedCommunityId)
    : [];

  const communityChipProps = (communityId: string | null) =>
    mode.buildHref
      ? { href: mode.buildHref({ communityId, categoryId: null }) }
      : { onClick: () => mode.onSelectCommunity(communityId) };
  const categoryChipProps = (categoryId: string | null) =>
    mode.buildHref
      ? { href: mode.buildHref({ communityId: selectedCommunityId, categoryId }) }
      : { onClick: () => mode.onSelectCategory(categoryId) };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Chip {...communityChipProps(null)} active={!selectedCommunityId}>
          All Communities
        </Chip>
        {communities.map((community) => (
          <Chip key={community.id} {...communityChipProps(community.id)} active={selectedCommunityId === community.id}>
            {community.name}
          </Chip>
        ))}
      </div>
      {selectedCommunityId && categoriesForSelectedCommunity.length > 0 && (
        <div className="flex flex-wrap gap-2 pl-4">
          <Chip {...categoryChipProps(null)} active={!selectedCategoryId}>
            All in this community
          </Chip>
          {categoriesForSelectedCommunity.map((category) => {
            const count = categoryCounts?.get(category.id);
            return (
              <Chip
                key={category.id}
                {...categoryChipProps(category.id)}
                active={selectedCategoryId === category.id}
                muted={count === 0}
              >
                {category.name}
                {!!count && <span className="ml-1 text-[0.65rem] tabular-nums opacity-70">{count}</span>}
              </Chip>
            );
          })}
        </div>
      )}
    </div>
  );
}
