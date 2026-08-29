import Link from "next/link";
import { cn } from "@/lib/utils";
import type { CommunityFilterSelection } from "@/components/shared/community-filter-pills";

/**
 * Nav-mode sibling of community-filter-pills.tsx's flat pill row — same
 * visual design (My Communities / All Communities / one pill per other
 * community, with counts), but Link-based instead of onClick-based. Kept
 * as a separate, non-"use client" component (mirroring
 * community-category-filter.tsx's own Link-only pattern) rather than a
 * dual-mode version of CommunityFilterPills: that component is "use
 * client" for its onClick handlers, and a Server Component page (e.g.
 * Library's browse page) can't pass a plain buildHref function prop across
 * that boundary — only a Server Action can cross it, and this isn't one.
 */
export function CommunityFilterPillsNav({
  communities,
  myCommunityIds,
  followsAllCommunities,
  selected,
  buildHref,
  counts,
}: {
  communities: { id: string; name: string }[];
  myCommunityIds: string[];
  followsAllCommunities: boolean;
  selected: CommunityFilterSelection;
  buildHref: (selection: CommunityFilterSelection) => string;
  /** Item count per pill (keyed by "mine"/"all"/communityId). Omit to render plain pills with no count. */
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
    return (
      <Link href={buildHref(selection)} scroll={false} className={chipClasses(active, counts?.get(selection) === 0)}>
        {label}
        <Count value={counts?.get(selection)} active={active} />
      </Link>
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
