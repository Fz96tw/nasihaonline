import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getFeedPage } from "@/lib/feed-server";
import { FeedList } from "@/components/feed/feed-list";

export const metadata: Metadata = {
  title: "What's New — NASIHA",
};

/** /whats-new — the post-sign-in landing page: a merged, newest-first feed across Events/Blog/Library/Forums/Announcements. */
export default async function WhatsNewPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const { items, nextCursor, hasMore } = await getFeedPage({ cursor: null });

  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-6 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">What&apos;s New</h1>
        <p className="text-muted-foreground">Recent activity across events, blog posts, the library, forums, and announcements.</p>
      </div>

      <div className="rounded-[10px] border">
        <FeedList initialItems={items} initialCursor={nextCursor} initialHasMore={hasMore} />
      </div>
    </main>
  );
}
