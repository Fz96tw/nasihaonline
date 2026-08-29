"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

export type CommunityFilterSelection = "mine" | "all" | (string & {});

/**
 * Flat, single-tier community filter — "My Communities" / "All
 * Communities" / one pill per community the member doesn't belong to.
 * Replaces the two-step Community -> Category chip design
 * (community-category-filter.tsx) for a consumer that doesn't need
 * category-level filtering because every item card already shows its own
 * category badges — swapped in after user feedback that the two-tier
 * design's identically-styled rows read as confusing rather than as a
 * clear community/category hierarchy.
 *
 * Two interaction modes, discriminated by which callback is passed:
 * `onSelect` for local-state filtering of already-loaded client data (Peer
 * Review's dashboard, no URL round trip), or `buildHref` for a
 * server-driven, shareable-URL page (Library's browse page, consistent
 * with its other filters — content type, level, sort, search — which all
 * navigate via `?param=`). Passing both is not meaningful; `buildHref`
 * wins if both are somehow provided.
 */
export function CommunityFilterPills({
  communities,
  myCommunityIds,
  followsAllCommunities,
  selected,
  onSelect,
  buildHref,
  counts,
}: {
  communities: { id: string; name: string }[];
  myCommunityIds: string[];
  followsAllCommunities: boolean;
  selected: CommunityFilterSelection;
  onSelect?: (selection: CommunityFilterSelection) => void;
  /** Nav mode — builds the href for each pill instead of firing a client-state callback. */
  buildHref?: (selection: CommunityFilterSelection) => string;
  /** Item count per pill (keyed by "mine"/"all"/communityId) for whichever list is currently in view — e.g. the active dashboard tab, or the full unfiltered browse result. Omit to render plain pills with no count. */
  counts?: Map<string, number>;
}) {
  const myIdSet = new Set(followsAllCommunities ? communities.map((c) => c.id) : myCommunityIds);
  const otherCommunities = communities.filter((c) => !myIdSet.has(c.id));

  const chipClasses = (active: boolean, muted: boolean) =>
    cn(
      "rounded-full px-3 py-1 text-sm font-medium transition-colors",
      active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70",
      muted && !active && "opacity-50",
    );

  function Count({ value, active }: { value: number | undefined; active: boolean }) {
    if (value === undefined) return null;
    return (
      <span className={cn("ml-1 text-[0.65rem] tabular-nums", active ? "text-primary-foreground/70" : "text-muted-foreground/70")}>
        {value}
      </span>
    );
  }

  function Pill({ selection, label }: { selection: CommunityFilterSelection; label: string }) {
    const active = selected === selection;
    const className = chipClasses(active, counts?.get(selection) === 0);
    const content = (
      <>
        {label}
        <Count value={counts?.get(selection)} active={active} />
      </>
    );
    return buildHref ? (
      <Link href={buildHref(selection)} scroll={false} className={className}>
        {content}
      </Link>
    ) : (
      <button type="button" onClick={() => onSelect?.(selection)} className={className}>
        {content}
      </button>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Pill selection="mine" label="My Communities" />
      <Pill selection="all" label="All Communities" />
      {otherCommunities.map((community) => (
        <Pill key={community.id} selection={community.id} label={community.name} />
      ))}
    </div>
  );
}
