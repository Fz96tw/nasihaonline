import { cn } from "@/lib/utils";
import type { CommunityFilterSelection } from "@/components/shared/community-filter-pills";
import { CommunityFilterCookieLink } from "@/components/shared/community-filter-cookie-link";
import { MyCommunitiesCheckbox } from "@/components/shared/my-communities-checkbox";
import { Avatar } from "@/components/ui/avatar";

/**
 * Nav-mode sibling of community-filter-pills.tsx's "Show only my
 * communities" checkbox + flat pill row — same visual design, but
 * Link-based instead of onClick-based. Kept as a separate, non-"use client"
 * component (mirroring community-category-filter.tsx's own Link-only
 * pattern) rather than a dual-mode version of CommunityFilterPills: that
 * component is "use client" for its onClick handlers, and a Server
 * Component page (e.g. Library's browse page) can't pass a plain buildHref
 * function prop across that boundary — only a Server Action can cross it,
 * and this isn't one.
 *
 * The checkbox and each pill remember the selection in `cookieName` (via
 * MyCommunitiesCheckbox / the small "use client" CommunityFilterCookieLink
 * leaf) so it persists across navigation to any other page reading the
 * same cookie — e.g. picking a community on /library and then landing on
 * /calendar with no explicit `?community=` shows the same selection,
 * mirroring SortButton's cookie pattern. Callers sharing this persistence
 * (Library, Calendar) must pass the same `cookieName` literal.
 */
export function CommunityFilterPillsNav({
  communities,
  myCommunityIds,
  followsAllCommunities,
  selected,
  buildHref,
  counts,
  cookieName,
  currentUserName,
  currentUserAvatarUrl,
}: {
  communities: { id: string; name: string; slug: string }[];
  myCommunityIds: string[];
  followsAllCommunities: boolean;
  /** `"mine"` (checkbox checked), a specific community id (a pill is active), or `undefined` (unchecked, no pill — show everything). */
  selected: CommunityFilterSelection | undefined;
  buildHref: (selection: CommunityFilterSelection | undefined) => string;
  /** Item count per pill (keyed by "mine"/communityId). Omit to render plain pills with no count. */
  counts?: Map<string, number>;
  /** Cookie name this checkbox/pill row's selection is remembered under — pass the same literal from every page that should share persistence. */
  cookieName: string;
  currentUserName: string;
  currentUserAvatarUrl?: string | null;
}) {
  const myIdSet = new Set(followsAllCommunities ? communities.map((c) => c.id) : myCommunityIds);
  const checked = selected === "mine";
  // "Show only my communities" is a no-op once the member already belongs to
  // every community — checking it can't narrow anything further, so the
  // checkbox (and its "Filter Content" label) just adds noise. The
  // per-community pills below still narrow to one specific community, so
  // those stay.
  const joinedAll = followsAllCommunities || (communities.length > 0 && myCommunityIds.length >= communities.length);

  const chipClasses = (active: boolean, muted: boolean) =>
    cn(
      "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition-colors",
      active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70",
      muted && !active && "opacity-50",
    );

  function Count({ value, active }: { value: number | undefined; active: boolean }) {
    if (value === undefined) return null;
    return (
      <span className={cn("text-[0.65rem] tabular-nums", active ? "text-primary-foreground/70" : "text-muted-foreground/70")}>
        {value}
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {!joinedAll && (
        <>
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Filter Content</span>
          <MyCommunitiesCheckbox
            checked={checked}
            href={buildHref(checked ? undefined : "mine")}
            cookieName={cookieName}
            checkedValue="mine"
            uncheckedValue=""
            count={counts?.get("mine")}
          />
        </>
      )}
      {(joinedAll || !checked) && communities.length > 0 && (
        <div className="flex flex-wrap gap-2 pl-1">
          {communities.map((community) => {
            const active = selected === community.id;
            return (
              <CommunityFilterCookieLink
                key={community.id}
                href={buildHref(active ? undefined : community.id)}
                className={chipClasses(active, counts?.get(community.id) === 0)}
                cookieName={cookieName}
                cookieValue={active ? "" : community.slug}
              >
                {myIdSet.has(community.id) && (
                  <Avatar name={currentUserName} src={currentUserAvatarUrl} size="xs" className="h-4 w-4 shrink-0 text-[8px]" />
                )}
                {community.name}
                <Count value={counts?.get(community.id)} active={active} />
              </CommunityFilterCookieLink>
            );
          })}
        </div>
      )}
    </div>
  );
}
