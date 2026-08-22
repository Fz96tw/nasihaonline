import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Rss } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { getFeedPage } from "@/lib/feed-server";
import { FEED_TYPES, FEED_TYPE_LABELS, isFeedItemType } from "@/lib/feed";
import { FeedList } from "@/components/feed/feed-list";
import { FeedSearchForm } from "@/components/feed/feed-search-form";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "What's New — NASIHA",
};

/** /whats-new — the post-sign-in landing page: a merged, newest-first feed across Events/Blog/Library/Forums/Announcements. */
export default async function WhatsNewPage({
  searchParams,
}: {
  searchParams: { type?: string; q?: string };
}) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const activeType = isFeedItemType(searchParams.type) ? searchParams.type : undefined;
  const q = searchParams.q?.trim() || undefined;
  const { items, nextCursor, hasMore } = await getFeedPage({
    cursor: null,
    types: activeType ? [activeType] : undefined,
    viewerId: user.id,
    viewerRole: user.role,
    q,
  });

  const filterLinkClasses = (isActive: boolean) =>
    cn(
      "rounded-full border px-3 py-1 text-sm font-medium transition-colors",
      isActive
        ? "border-primary bg-primary text-primary-foreground"
        : "border-input text-muted-foreground hover:bg-accent/50 hover:text-foreground",
    );

  // Preserves the active search query across a type-pill click (and vice
  // versa) — the pills and the search form filter the same feed together,
  // not as two separate, mutually-clearing views.
  const filterHref = (type?: string) => {
    const params = new URLSearchParams();
    if (type) params.set("type", type);
    if (q) params.set("q", q);
    const qs = params.toString();
    return qs ? `/whats-new?${qs}` : "/whats-new";
  };

  // The Inbox pill only makes sense while a search is active (getFeedPage's
  // inbox branch never returns anything without a query) — hidden outside
  // search mode rather than left clickable into a dead, unexplained "0
  // results" state. FEED_TYPES itself stays canonical/unfiltered everywhere
  // else (feed-server.ts, the API route) — this only changes what renders here.
  const visiblePillTypes = q ? FEED_TYPES : FEED_TYPES.filter((type) => type !== "inbox");

  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-6 px-[2px] py-8 sm:px-8">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          <Rss className="h-7 w-7" aria-hidden="true" />
          What&apos;s New
        </h1>
        <FeedSearchForm activeType={activeType} q={q} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href={filterHref()} className={filterLinkClasses(activeType === undefined)}>
          All
        </Link>
        {visiblePillTypes.map((type) => (
          <Link key={type} href={filterHref(type)} className={filterLinkClasses(activeType === type)}>
            {FEED_TYPE_LABELS[type]}
          </Link>
        ))}
      </div>

      <div className="rounded-[10px] border">
        <FeedList
          key={`${activeType ?? "all"}-${q ?? ""}`}
          initialItems={items}
          initialCursor={nextCursor}
          initialHasMore={hasMore}
          activeType={activeType}
          q={q}
        />
      </div>
    </main>
  );
}
