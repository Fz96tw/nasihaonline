"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { FeedList } from "@/components/feed/feed-list";
import { type FeedCursor, type FeedItem } from "@/lib/feed";
import type { FollowingChip } from "@/lib/member-follows-server";
import { cn } from "@/lib/utils";

type Page = { items: FeedItem[]; nextCursor: FeedCursor | null; hasMore: boolean };

/**
 * What's New's "Following" pane: recent items from the members the viewer
 * follows, with a chip row to narrow to one of them. Fetched on first
 * activation (most visits never open this pane) from
 * GET /api/whats-new?following=1[&member=<id>]; each selection's first page is
 * cached so flipping back and forth doesn't refetch.
 */
export function FollowingFeed({ active, currentUserId }: { active: boolean; currentUserId: string }) {
  const [people, setPeople] = useState<FollowingChip[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [pages, setPages] = useState<Record<string, Page>>({});
  const [failed, setFailed] = useState(false);
  const requested = useRef<Set<string>>(new Set());

  const key = selected ?? "all";

  const load = useCallback((member: string | null) => {
    const pageKey = member ?? "all";
    if (requested.current.has(pageKey)) return;
    requested.current.add(pageKey);
    setFailed(false);
    fetch(`/api/whats-new?following=1${member ? `&member=${member}` : ""}`)
      .then((response) => {
        if (!response.ok) throw new Error("Failed to load");
        return response.json() as Promise<Page & { people?: FollowingChip[] }>;
      })
      .then(({ people: chips, ...page }) => {
        if (chips) setPeople(chips);
        setPages((prev) => ({ ...prev, [pageKey]: page }));
      })
      .catch(() => {
        requested.current.delete(pageKey);
        setFailed(true);
      });
  }, []);

  useEffect(() => {
    if (active) load(selected);
  }, [active, selected, load]);

  const page = pages[key];

  const chipClasses = (isSelected: boolean) =>
    cn(
      "flex max-w-full items-center gap-1.5 rounded-full border py-1 pl-1 pr-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      isSelected
        ? "border-primary bg-primary text-primary-foreground"
        : "border-input text-muted-foreground hover:bg-accent/50 hover:text-foreground",
    );

  return (
    <>
      {/* Wraps to the feed's width (no sideways scroll); data-no-swipe so taps/drags here never start a pane swipe. */}
      {people.length > 0 && (
        <div data-no-swipe className="flex flex-wrap gap-2" role="group" aria-label="Filter by member">
          <button
            type="button"
            aria-pressed={selected === null}
            onClick={() => setSelected(null)}
            className={cn(chipClasses(selected === null), "pl-3")}
          >
            Everyone
          </button>
          {people.map((person) => (
            <button
              key={person.id}
              type="button"
              aria-pressed={selected === person.id}
              onClick={() => setSelected(selected === person.id ? null : person.id)}
              className={chipClasses(selected === person.id)}
            >
              <Avatar name={person.name} src={person.avatarUrl} size="xs" />
              <span className="truncate">{person.name}</span>
            </button>
          ))}
        </div>
      )}
      <div className="rounded-[10px] border">
        {page ? (
          <FeedList
            key={key}
            initialItems={page.items}
            initialCursor={page.nextCursor}
            initialHasMore={page.hasMore}
            currentUserId={currentUserId}
            following
            followingMember={selected}
          />
        ) : failed ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Couldn&apos;t load this. Try again later.</p>
        ) : (
          <p className="p-6 text-center text-sm text-muted-foreground">Loading…</p>
        )}
      </div>
    </>
  );
}
