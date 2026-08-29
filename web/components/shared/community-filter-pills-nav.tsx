import { cn } from "@/lib/utils";
import type { CommunityFilterSelection } from "@/components/shared/community-filter-pills";
import { CommunityFilterCookieLink } from "@/components/shared/community-filter-cookie-link";

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
 *
 * Each pill also remembers the selection in `cookieName` (via the small
 * "use client" CommunityFilterCookieLink leaf) so it persists across
 * navigation to any other page reading the same cookie — e.g. picking a
 * community on /library and then landing on /calendar with no explicit
 * `?community=` shows the same selection, mirroring SortButton's cookie
 * pattern. Callers sharing this persistence (Library, Calendar) must pass
 * the same `cookieName` literal.
 */
export function CommunityFilterPillsNav({
  communities,
  myCommunityIds,
  followsAllCommunities,
  selected,
  buildHref,
  counts,
  cookieName,
}: {
  communities: { id: string; name: string; slug: string }[];
  myCommunityIds: string[];
  followsAllCommunities: boolean;
  selected: CommunityFilterSelection;
  buildHref: (selection: CommunityFilterSelection) => string;
  /** Item count per pill (keyed by "mine"/"all"/communityId). Omit to render plain pills with no count. */
  counts?: Map<string, number>;
  /** Cookie name this pill row's selection is remembered under — pass the same literal from every page that should share persistence. */
  cookieName: string;
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

  // cookieValue mirrors the URL's own representation (?community=<slug>,
  // or the literal "mine"/"all") — NOT `selection` directly, since a
  // specific-community `selection` is the community's id while the URL
  // (and thus what a page parses back out of the cookie) uses its slug.
  function Pill({
    selection,
    cookieValue,
    label,
  }: {
    selection: CommunityFilterSelection;
    cookieValue: string;
    label: string;
  }) {
    const active = selected === selection;
    return (
      <CommunityFilterCookieLink
        href={buildHref(selection)}
        className={chipClasses(active, counts?.get(selection) === 0)}
        cookieName={cookieName}
        cookieValue={cookieValue}
      >
        {label}
        <Count value={counts?.get(selection)} active={active} />
      </CommunityFilterCookieLink>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Pill selection="mine" cookieValue="mine" label="My Communities" />
      <Pill selection="all" cookieValue="all" label="All Communities" />
      {otherCommunities.map((community) => (
        <Pill key={community.id} selection={community.id} cookieValue={community.slug} label={community.name} />
      ))}
    </div>
  );
}
