"use client";

import { cn } from "@/lib/utils";

export type CommunityFilterSelection = "mine" | "all" | (string & {});

/**
 * Flat, single-tier community filter — "My Communities" / "All
 * Communities" / one pill per community the member doesn't belong to.
 * Replaces the two-step Community -> Category chip design
 * (community-category-filter.tsx) for a consumer that doesn't need
 * category-level filtering because every item card already shows its own
 * category badges (the Peer Review dashboard) — swapped in after user
 * feedback that the two-tier design's identically-styled rows read as
 * confusing rather than as a clear community/category hierarchy.
 *
 * Local-state only (no href/nav mode) — its one consumer (ReviewDashboardTabs)
 * already filters already-loaded client data with no URL round trip.
 */
export function CommunityFilterPills({
  communities,
  myCommunityIds,
  followsAllCommunities,
  selected,
  onSelect,
}: {
  communities: { id: string; name: string }[];
  myCommunityIds: string[];
  followsAllCommunities: boolean;
  selected: CommunityFilterSelection;
  onSelect: (selection: CommunityFilterSelection) => void;
}) {
  const myIdSet = new Set(followsAllCommunities ? communities.map((c) => c.id) : myCommunityIds);
  const otherCommunities = communities.filter((c) => !myIdSet.has(c.id));

  const chipClasses = (active: boolean) =>
    cn(
      "rounded-full px-3 py-1 text-sm font-medium transition-colors",
      active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70",
    );

  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => onSelect("mine")} className={chipClasses(selected === "mine")}>
        My Communities
      </button>
      <button type="button" onClick={() => onSelect("all")} className={chipClasses(selected === "all")}>
        All Communities
      </button>
      {otherCommunities.map((community) => (
        <button
          key={community.id}
          type="button"
          onClick={() => onSelect(community.id)}
          className={chipClasses(selected === community.id)}
        >
          {community.name}
        </button>
      ))}
    </div>
  );
}
