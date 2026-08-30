"use client";

import { Avatar } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

/** `"mine"` (the checkbox is checked) or a specific community id (a pill is active). `undefined` means unchecked with no pill picked — show everything, unrestricted. */
export type CommunityFilterSelection = "mine" | (string & {});

function chipClasses(active: boolean, muted: boolean) {
  return cn(
    "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition-colors",
    active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70",
    muted && !active && "opacity-50",
  );
}

function Count({ value, active }: { value: number | undefined; active: boolean }) {
  if (value === undefined) return null;
  return (
    <span className={cn("text-[0.65rem] tabular-nums", active ? "text-primary-foreground/70" : "text-muted-foreground/70")}>
      {value}
    </span>
  );
}

/**
 * Single "Show only my communities" checkbox (same label/behavior as
 * MyCommunitiesCheckbox on /whats-new) plus, only while unchecked, a flat
 * row of one pill per community — clicking a pill narrows to just that
 * community, clicking it again clears back to "everything". Checked means
 * the aggregate of the member's own joined communities (pills hidden
 * entirely, same as the old "My Communities" tab); unchecked with no pill
 * picked is a new third state this replaces the old "Other Communities"
 * tab with — every community's content, not just non-member ones (no more
 * unfiltered-content-has-no-representation gap that tab had).
 *
 * A pill for a community the member already belongs to carries their own
 * avatar as a small badge — the visual replacement for what the old
 * checked-tab grouping used to convey structurally.
 *
 * Local-state only (no href/nav mode) — its one consumer
 * (ReviewDashboardTabs) already filters already-loaded client data with no
 * URL round trip. A server-driven, shareable-URL consumer (e.g. Library's
 * browse page) needs community-filter-pills-nav.tsx instead: this
 * component is "use client" (its onClick handlers require it), so a
 * Server Component parent can't pass it a plain buildHref function prop —
 * only a Server Action — the same client/server boundary rule that keeps
 * community-category-filter.tsx (Link-only, no "use client") a separate
 * component from this one rather than a single dual-mode file.
 */
export function CommunityFilterPills({
  communities,
  myCommunityIds,
  followsAllCommunities,
  selected,
  onSelect,
  counts,
  currentUserName,
  currentUserAvatarUrl,
}: {
  communities: { id: string; name: string }[];
  myCommunityIds: string[];
  followsAllCommunities: boolean;
  selected: CommunityFilterSelection | undefined;
  onSelect: (selection: CommunityFilterSelection | undefined) => void;
  /** Item count per pill (keyed by "mine"/communityId) for whichever list is currently in view — e.g. the active dashboard tab. Omit to render plain pills with no count. */
  counts?: Map<string, number>;
  currentUserName: string;
  currentUserAvatarUrl?: string | null;
}) {
  const myIdSet = new Set(followsAllCommunities ? communities.map((c) => c.id) : myCommunityIds);
  const checked = selected === "mine";
  // Same rationale as community-filter-pills-nav.tsx: once the member
  // already belongs to every community, "Show only my communities" can't
  // narrow anything further, so hide it (and its label) — the per-community
  // pills still do useful narrowing, so those stay.
  const joinedAll = followsAllCommunities || (communities.length > 0 && myCommunityIds.length >= communities.length);

  return (
    <div className="flex flex-col gap-2">
      {!joinedAll && (
        <>
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Filter Content</span>
          <label className="flex w-fit cursor-pointer items-center gap-1.5 text-sm text-muted-foreground">
            <Checkbox checked={checked} onCheckedChange={(next) => onSelect(next ? "mine" : undefined)} />
            Show only my communities
            <Count value={counts?.get("mine")} active={checked} />
          </label>
        </>
      )}
      {(joinedAll || !checked) && communities.length > 0 && (
        <div className="flex flex-wrap gap-2 pl-1">
          {communities.map((community) => (
            <button
              key={community.id}
              type="button"
              onClick={() => onSelect(selected === community.id ? undefined : community.id)}
              className={chipClasses(selected === community.id, counts?.get(community.id) === 0)}
            >
              {myIdSet.has(community.id) && (
                <Avatar name={currentUserName} src={currentUserAvatarUrl} size="xs" className="h-4 w-4 shrink-0 text-[8px]" />
              )}
              {community.name}
              <Count value={counts?.get(community.id)} active={selected === community.id} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
