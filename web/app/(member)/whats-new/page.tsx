import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Rss } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { getFeedPage } from "@/lib/feed-server";
import { FEED_TYPES, FEED_TYPE_LABELS, isFeedItemType } from "@/lib/feed";
import { FeedList } from "@/components/feed/feed-list";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
    q,
  });

  const filterLinkClasses = (isActive: boolean) =>
    cn(
      "rounded-full border px-3 py-1 text-sm font-medium transition-colors",
      isActive
        ? "border-primary bg-primary text-primary-foreground"
        : "border-input text-muted-foreground hover:bg-accent/50 hover:text-foreground",
    );

  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-6 px-[2px] py-8 sm:px-8">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          <Rss className="h-7 w-7" aria-hidden="true" />
          What&apos;s New
        </h1>
        <p className="text-muted-foreground">Recent activity across events, blog posts, the library, forums, and announcements.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/whats-new" className={filterLinkClasses(activeType === undefined)}>
          All
        </Link>
        {FEED_TYPES.map((type) => (
          <Link key={type} href={`/whats-new?type=${type}`} className={filterLinkClasses(activeType === type)}>
            {FEED_TYPE_LABELS[type]}
          </Link>
        ))}
      </div>

      <form action="/whats-new" method="get" className="flex gap-2">
        {activeType ? <input type="hidden" name="type" value={activeType} /> : null}
        <Input type="search" name="q" defaultValue={q} placeholder="Search the feed…" className="max-w-sm" />
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>

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
