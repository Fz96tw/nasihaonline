import Link from "next/link";
import { cn } from "@/lib/utils";

function Chip({ href, active, muted, children }: { href: string; active: boolean; muted?: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      className={cn(
        "rounded-full px-3 py-1 text-sm font-medium transition-colors",
        active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70",
        muted && !active && "opacity-50",
      )}
    >
      {children}
    </Link>
  );
}

/**
 * Two-step community -> category browse filter (community-based-
 * categorization initiative, objective 3) — a row of Community chips
 * (single-select), revealing that community's category chips once picked.
 * Server-rendered/URL-param-driven (plain next/link, no client state) to
 * match Library's existing shareable-URL filter chips — `buildHref` owns
 * each page's own param shape (e.g. preserving `?type=`/`?level=`/`?q=`
 * alongside `community`/`category`), keeping this component agnostic of
 * any one page's other filters.
 *
 * Library-only as of objective 5: the Peer Review dashboard switched to
 * the flatter CommunityFilterPills (My Communities / All Communities / one
 * pill per other community, no category tier) after user feedback that
 * this component's two identically-styled chip rows read as confusing —
 * category-level filtering there was also redundant with the category
 * badges every item card already shows. This component still fits Library,
 * where categories aren't shown on browse-grid cards.
 *
 * Default-filter-state behavior (no explicit selection scoping to the
 * member's own communities) is NOT this component's job — it only renders
 * the current selection it's given. See getDefaultCommunityFilter in
 * lib/profile-server.ts for that, applied once by each consuming page's
 * data query rather than duplicated here.
 */
export function CommunityCategoryFilter({
  communities,
  categories,
  selectedCommunityId,
  selectedCategoryId,
  buildHref,
  categoryCounts,
}: {
  communities: { id: string; name: string }[];
  categories: { id: string; name: string; communityId: string }[];
  selectedCommunityId: string | null;
  selectedCategoryId: string | null;
  buildHref: (next: { communityId: string | null; categoryId: string | null }) => string;
  /** Optional per-category item count, shown the same way Library's original chips did. */
  categoryCounts?: Map<string, number>;
}) {
  const categoriesForSelectedCommunity = selectedCommunityId
    ? categories.filter((category) => category.communityId === selectedCommunityId)
    : [];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Chip href={buildHref({ communityId: null, categoryId: null })} active={!selectedCommunityId}>
          All Communities
        </Chip>
        {communities.map((community) => (
          <Chip
            key={community.id}
            href={buildHref({ communityId: community.id, categoryId: null })}
            active={selectedCommunityId === community.id}
          >
            {community.name}
          </Chip>
        ))}
      </div>
      {selectedCommunityId && categoriesForSelectedCommunity.length > 0 && (
        <div className="flex flex-wrap gap-2 pl-4">
          <Chip href={buildHref({ communityId: selectedCommunityId, categoryId: null })} active={!selectedCategoryId}>
            All in this community
          </Chip>
          {categoriesForSelectedCommunity.map((category) => {
            const count = categoryCounts?.get(category.id);
            return (
              <Chip
                key={category.id}
                href={buildHref({ communityId: selectedCommunityId, categoryId: category.id })}
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
