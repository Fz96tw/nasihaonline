"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { useSearchQuery } from "@/components/header-search-context";
import { Checkbox } from "@/components/ui/checkbox";

// Sized for two lines (search input + communities line) now that the
// community-based-categorization initiative (objective 2) adds a second
// row of content — was 56px (one line) before.
const ROW_HEIGHT_PX = 88;
// Accumulated scroll distance (not per-event delta — a single scroll event
// can fire with a tiny delta many times) needed in one direction before
// flipping revealed state.
const REVEAL_DELTA = 32;
const HIDE_DELTA = 32;
// Chromium (and real trackpads/momentum scrolling) apply their own
// deceleration easing to a scroll, independent of any CSS scroll-behavior —
// a large scroll settles over several more frames, often drifting a couple
// dozen px in the OPPOSITE direction as it decelerates. Without a cooldown,
// that settle-wobble alone is enough to immediately re-trigger the opposite
// flip right after a real one (confirmed: a single 1500px programmatic
// scroll produced a ~29px reverse drift over the next ~10 events). This
// blocks another flip for a short window after each one, long enough to
// absorb that settle tail but short enough that a genuinely new scroll
// gesture afterward still feels responsive.
const FLIP_COOLDOWN_MS = 200;

/**
 * The header's second row — full-width search input, sticky directly below
 * the main header row (`top-[var(--header-height)]`, see scroll-header.tsx),
 * shown identically on desktop and mobile. Its own height lives in the
 * `--search-row-height` CSS var (defaulted in globals.css, composed into
 * member-sidebar.tsx's position/height alongside `--header-height`).
 *
 * Visibility is scroll-direction-driven (reveal on scroll up, hide on
 * scroll down, from anywhere on the page) UNLESS `pinned` (query.trim() is
 * non-empty), in which case it's forced fully open and the scroll listener
 * isn't even attached — restored to normal scroll-driven behavior, fresh
 * (revealed, as at initial load), the moment the field is cleared.
 *
 * `communities`/`followsAllCommunities` (community-based-categorization
 * initiative, objective 2) come from the signed-in member's Profile, fetched
 * once by the server-rendered SiteHeader — this component only ever mounts
 * for a signed-in user (`{user && <HeaderSearchRow />}` in site-header.tsx),
 * so there's no signed-out-visitor case to hide here.
 */
export function HeaderSearchRow({
  communities,
  followsAllCommunities,
}: {
  communities: { id: string; name: string }[];
  followsAllCommunities: boolean;
}) {
  const { query, setQuery, pinned, setSearchRowVisible } = useSearchQuery();
  const router = useRouter();
  const searchParams = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);

  // Reads `q` off whatever page is currently active, not just /whats-new —
  // every detail page reached from a search result also carries `&q=` (see
  // lib/feed.ts's withFeedRef), so the row should keep showing the active
  // query there too, not clear itself the moment you click through.
  const urlQuery = searchParams.get("q") ?? "";
  useEffect(() => {
    setQuery(urlQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setQuery is stable (useState setter via context)
  }, [urlQuery]);

  const [myCommunities, setMyCommunities] = useState(searchParams.get("myCommunities") === "1");
  useEffect(() => {
    setMyCommunities(searchParams.get("myCommunities") === "1");
  }, [searchParams]);

  useEffect(() => {
    const root = document.documentElement;
    if (pinned) {
      root.style.setProperty("--search-row-height", `${ROW_HEIGHT_PX}px`);
      setSearchRowVisible(true);
      return;
    }

    let revealed = true;
    let lastY = window.scrollY;
    let accum = 0;
    let lastFlipAt = 0;

    const apply = () => {
      root.style.setProperty("--search-row-height", revealed ? `${ROW_HEIGHT_PX}px` : "0px");
      setSearchRowVisible(revealed);
    };

    const handleScroll = () => {
      const y = window.scrollY;
      const diff = y - lastY;
      lastY = y;

      if (y <= 0) {
        revealed = true;
        accum = 0;
      } else if (Date.now() - lastFlipAt < FLIP_COOLDOWN_MS) {
        // Still settling from the last flip — don't accumulate at all, or a
        // deceleration-tail wobble in the opposite direction immediately
        // undoes what the user just triggered.
      } else {
        // Direction flipped — restart the accumulator toward the new direction.
        if ((diff < 0 && accum > 0) || (diff > 0 && accum < 0)) accum = 0;
        accum += diff;
        if (!revealed && accum <= -REVEAL_DELTA) {
          revealed = true;
          accum = 0;
          lastFlipAt = Date.now();
        } else if (revealed && accum >= HIDE_DELTA) {
          revealed = false;
          accum = 0;
          lastFlipAt = Date.now();
        }
      }
      apply();
    };

    apply();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [pinned, setSearchRowVisible]);

  // Shared by both the form submit and the checkbox's immediate toggle —
  // navigating on toggle (not just on next submit) is what makes "actually
  // scopes /whats-new search results" true the moment you click it, even
  // while a query is already active.
  function navigate(nextMyCommunities: boolean) {
    const trimmed = query.trim();
    const params = new URLSearchParams();
    if (trimmed) params.set("q", trimmed);
    if (nextMyCommunities) params.set("myCommunities", "1");
    const qs = params.toString();
    router.push(qs ? `/whats-new?${qs}` : "/whats-new");
  }

  const communityLabel = followsAllCommunities
    ? "All Communities"
    : communities.length > 0
      ? communities.map((c) => c.name).join(", ")
      : "None selected";

  return (
    <div className="sticky top-[var(--header-height)] z-40 h-[var(--search-row-height)] overflow-hidden border-b bg-background shadow-sm transition-[height] duration-300 ease-in-out">
      <div className="flex h-full flex-col justify-center gap-1.5 px-4 py-2 lg:px-8">
        <div className="mx-auto flex w-full max-w-[720px] items-center gap-3">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              navigate(myCommunities);
            }}
            className="relative flex-1"
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              placeholder="Search NASIHA…"
              aria-label="Search NASIHA"
              onChange={(event) => setQuery(event.currentTarget.value)}
              className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-9 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-search-cancel-button]:appearance-none"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </form>
          <label className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
            <Checkbox
              checked={myCommunities}
              onCheckedChange={(checked) => {
                const next = Boolean(checked);
                setMyCommunities(next);
                navigate(next);
              }}
            />
            <span className="hidden sm:inline">Search only my communities</span>
          </label>
        </div>
        <div className="mx-auto flex w-full max-w-[720px] items-center gap-2 truncate text-xs text-muted-foreground">
          <span className="truncate">
            Your Communities: <span className="text-foreground">{communityLabel}</span>
          </span>
          <Link href="/welcome/communities" className="shrink-0 underline underline-offset-2 hover:text-foreground">
            Edit
          </Link>
        </div>
      </div>
    </div>
  );
}
