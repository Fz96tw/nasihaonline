import { cn } from "@/lib/utils";
import type { CommunityFilterSelection } from "@/components/shared/community-filter-pills";
import { CommunityFilterCookieLink } from "@/components/shared/community-filter-cookie-link";

/**
 * Nav-mode sibling of community-filter-pills.tsx's two-level filter — same
 * visual design (My Communities / Other Communities tabs, with a second
 * row of individual community pills for whichever tab is active), but
 * Link-based instead of onClick-based. Kept as a separate, non-"use client"
 * component (mirroring community-category-filter.tsx's own Link-only
 * pattern) rather than a dual-mode version of CommunityFilterPills: that
 * component is "use client" for its onClick handlers, and a Server
 * Component page (e.g. Library's browse page) can't pass a plain buildHref
 * function prop across that boundary — only a Server Action can cross it,
 * and this isn't one.
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
  /** Item count per pill (keyed by "mine"/"other"/communityId). Omit to render plain pills with no count. */
  counts?: Map<string, number>;
  /** Cookie name this pill row's selection is remembered under — pass the same literal from every page that should share persistence. */
  cookieName: string;
}) {
  const myIdSet = new Set(followsAllCommunities ? communities.map((c) => c.id) : myCommunityIds);
  const myCommunities = communities.filter((c) => myIdSet.has(c.id));
  const otherCommunities = communities.filter((c) => !myIdSet.has(c.id));
  const activeTab: "mine" | "other" =
    selected === "mine" ? "mine" : selected === "other" ? "other" : myIdSet.has(selected) ? "mine" : "other";
  const subCommunities = activeTab === "mine" ? myCommunities : otherCommunities;

  const chipClasses = (active: boolean, muted: boolean) =>
    cn(
      "rounded-full px-3 py-1 text-sm font-medium transition-colors",
      active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70",
      muted && !active && "opacity-50",
    );

  // The My/Other tab pair reads as one segmented toggle (a single
  // pill-shaped track with the active side filled) rather than two
  // separate free-floating pills — visually distinct from the sub-pill
  // row underneath, which stays a flat wrapping list of independent pills.
  const tabClasses = (active: boolean) =>
    cn(
      "rounded-full px-3 py-1 text-sm font-medium transition-colors",
      active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
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
  // or the literal "mine"/"other") — NOT `selection` directly, since a
  // specific-community `selection` is the community's id while the URL
  // (and thus what a page parses back out of the cookie) uses its slug.
  function Pill({
    selection,
    cookieValue,
    label,
    active,
    variant = "chip",
  }: {
    selection: CommunityFilterSelection;
    cookieValue: string;
    label: string;
    active: boolean;
    variant?: "chip" | "tab";
  }) {
    return (
      <CommunityFilterCookieLink
        href={buildHref(selection)}
        className={variant === "tab" ? tabClasses(active) : chipClasses(active, counts?.get(selection) === 0)}
        cookieName={cookieName}
        cookieValue={cookieValue}
      >
        {label}
        <Count value={counts?.get(selection)} active={active} />
      </CommunityFilterCookieLink>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="inline-flex w-fit gap-0.5 rounded-full border bg-muted p-1">
        <Pill selection="mine" cookieValue="mine" label="My Communities" active={activeTab === "mine"} variant="tab" />
        <Pill
          selection="other"
          cookieValue="other"
          label="Other Communities"
          active={activeTab === "other"}
          variant="tab"
        />
      </div>
      {subCommunities.length > 0 && (
        <div className="flex flex-wrap gap-2 pl-1">
          {subCommunities.map((community) => (
            <Pill
              key={community.id}
              selection={community.id}
              cookieValue={community.slug}
              label={community.name}
              active={selected === community.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
