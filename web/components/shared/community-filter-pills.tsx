"use client";

import { cn } from "@/lib/utils";

export type CommunityFilterSelection = "mine" | "other" | (string & {});

function chipClasses(active: boolean, muted: boolean) {
  return cn(
    "rounded-full px-3 py-1 text-sm font-medium transition-colors",
    active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70",
    muted && !active && "opacity-50",
  );
}

function Count({ value, active }: { value: number | undefined; active: boolean }) {
  if (value === undefined) return null;
  return (
    <span className={cn("ml-1 text-[0.65rem] tabular-nums", active ? "text-primary-foreground/70" : "text-muted-foreground/70")}>
      {value}
    </span>
  );
}

/**
 * Two-level community filter — a top row of "My Communities" / "Other
 * Communities" tabs, and a second row underneath listing the individual
 * communities for whichever tab is active. Replaces the earlier flat "My
 * Communities" / "All Communities" / one-pill-per-community row: there's
 * no more unfiltered "everything" state — picking the "Other Communities"
 * tab alone shows nothing until the member picks a specific community pill
 * below it, same as "My Communities" only ever means the aggregate of the
 * member's own joined communities, never every community (confirmed with
 * user). Local-state only (no href/nav mode) — its one consumer
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
}: {
  communities: { id: string; name: string }[];
  myCommunityIds: string[];
  followsAllCommunities: boolean;
  selected: CommunityFilterSelection;
  onSelect: (selection: CommunityFilterSelection) => void;
  /** Item count per pill (keyed by "mine"/"other"/communityId) for whichever list is currently in view — e.g. the active dashboard tab. Omit to render plain pills with no count. */
  counts?: Map<string, number>;
}) {
  const myIdSet = new Set(followsAllCommunities ? communities.map((c) => c.id) : myCommunityIds);
  const myCommunities = communities.filter((c) => myIdSet.has(c.id));
  const otherCommunities = communities.filter((c) => !myIdSet.has(c.id));
  const activeTab: "mine" | "other" =
    selected === "mine" ? "mine" : selected === "other" ? "other" : myIdSet.has(selected) ? "mine" : "other";
  const subCommunities = activeTab === "mine" ? myCommunities : otherCommunities;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onSelect("mine")}
          className={chipClasses(activeTab === "mine", counts?.get("mine") === 0)}
        >
          My Communities
          <Count value={counts?.get("mine")} active={activeTab === "mine"} />
        </button>
        <button
          type="button"
          onClick={() => onSelect("other")}
          className={chipClasses(activeTab === "other", counts?.get("other") === 0)}
        >
          Other Communities
          <Count value={counts?.get("other")} active={activeTab === "other"} />
        </button>
      </div>
      {subCommunities.length > 0 && (
        <div className="flex flex-wrap gap-2 pl-1">
          {subCommunities.map((community) => (
            <button
              key={community.id}
              type="button"
              onClick={() => onSelect(community.id)}
              className={chipClasses(selected === community.id, counts?.get(community.id) === 0)}
            >
              {community.name}
              <Count value={counts?.get(community.id)} active={selected === community.id} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
