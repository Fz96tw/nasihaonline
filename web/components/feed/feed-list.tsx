"use client";

import { useState } from "react";
import { type FeedItem, type FeedItemType, type FeedCursor, encodeFeedCursor } from "@/lib/feed";
import { FeedRow } from "@/components/feed/feed-row";
import { Button } from "@/components/ui/button";

export function FeedList({
  initialItems,
  initialCursor,
  initialHasMore,
  activeType,
}: {
  initialItems: FeedItem[];
  initialCursor: FeedCursor | null;
  initialHasMore: boolean;
  activeType?: FeedItemType;
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
      const response = await fetch(`/api/whats-new?cursor=${encodeFeedCursor(cursor)}${typeParam}`);
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
    return <p className="p-6 text-center text-sm text-muted-foreground">Nothing here yet.</p>;
  }

  return (
    <div className="flex flex-col">
      <ul className="flex flex-col divide-y">
        {items.map((item) => (
          <FeedRow key={`${item.type}-${item.id}`} item={item} />
        ))}
      </ul>
      {hasMore && (
        <div className="flex justify-center p-4">
          <Button variant="outline" onClick={loadMore} disabled={loading}>
            {loading ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}
