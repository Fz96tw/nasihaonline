"use client";

import { useState } from "react";
import { type FeedItem, type FeedItemType, type FeedCursor, encodeFeedCursor } from "@/lib/feed";
import { FeedRow } from "@/components/feed/feed-row";
import { Button } from "@/components/ui/button";

export function FeedList({
  initialItems,
  initialCursor,
  initialHasMore,
  totalCount,
  activeType,
  q,
  myCommunities,
  currentUserId,
  following,
  followingMember,
}: {
  initialItems: FeedItem[];
  initialCursor: FeedCursor | null;
  initialHasMore: boolean;
  /**
   * Search mode only: getFeedPage's permission-filtered match total, shown
   * as "Showing X of Y" beside "Load more". Taken from the first page and
   * not refreshed on later pages. The forum count can run slightly high, so
   * the line is shown only while hasMore is true, never as an exact
   * "N remaining".
   */
  totalCount?: number;
  activeType?: FeedItemType;
  /** Active search query (What's New feed's inline search box), threaded into "Load more" pagination. */
  q?: string;
  /** "Search only my communities" toggle, threaded into "Load more" pagination. */
  myCommunities?: boolean;
  currentUserId?: string;
  /** The "Following" pane: pages through only followed members' items (ignores type/search/communities). */
  following?: boolean;
  /** Following pane narrowed to one followed member (chip selection). */
  followingMember?: string | null;
}) {
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);

  async function loadMore() {
    if (!cursor || loading) return;
    setLoading(true);
    try {
      const typeParam = activeType ? `&type=${activeType}` : "";
      const qParam = q ? `&q=${encodeURIComponent(q)}` : "";
      const myCommunitiesParam = myCommunities ? `&myCommunities=1` : "";
      const response = await fetch(
        following
          ? `/api/whats-new?cursor=${encodeFeedCursor(cursor)}&following=1${followingMember ? `&member=${followingMember}` : ""}`
          : `/api/whats-new?cursor=${encodeFeedCursor(cursor)}${typeParam}${qParam}${myCommunitiesParam}`,
      );
      if (!response.ok) return;
      const data = (await response.json()) as { items: FeedItem[]; nextCursor: FeedCursor | null; hasMore: boolean };
      setItems((prev) => [...prev, ...data.items]);
      setCursor(data.nextCursor);
      setHasMore(data.hasMore);
    } finally {
      setLoading(false);
    }
  }

  if (items.length === 0) {
    return (
      <p className="p-6 text-center text-sm text-muted-foreground">
        {following ? "Nothing new from the people you follow yet." : "Nothing here yet."}
      </p>
    );
  }

  return (
    <div className="flex flex-col">
      <ul className="flex flex-col divide-y">
        {items.map((item) => (
          <FeedRow key={`${item.type}-${item.id}`} item={item} q={q} currentUserId={currentUserId} />
        ))}
      </ul>
      {hasMore && (
        <div className="flex flex-col items-center gap-2 p-4">
          {q && totalCount != null && (
            <p className="text-xs text-muted-foreground">
              Showing {items.length} of {Math.max(totalCount, items.length)} results
            </p>
          )}
          <Button variant="outline" onClick={loadMore} disabled={loading}>
            {loading ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}
