"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { useSearchQuery } from "@/components/header-search-context";

const ROW_HEIGHT_PX = 64;
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
 */
export function HeaderSearchRow() {
  const { query, setQuery, pinned } = useSearchQuery();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);

  const urlQuery = pathname === "/whats-new" ? searchParams.get("q") ?? "" : "";
  useEffect(() => {
    setQuery(urlQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setQuery is stable (useState setter via context)
  }, [urlQuery]);

  useEffect(() => {
    const root = document.documentElement;
    if (pinned) {
      root.style.setProperty("--search-row-height", `${ROW_HEIGHT_PX}px`);
      return;
    }

    let revealed = true;
    let lastY = window.scrollY;
    let accum = 0;
    let lastFlipAt = 0;

    const apply = () => {
      root.style.setProperty("--search-row-height", revealed ? `${ROW_HEIGHT_PX}px` : "0px");
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
  }, [pinned]);

  function submit() {
    const trimmed = query.trim();
    router.push(trimmed ? `/whats-new?q=${encodeURIComponent(trimmed)}` : "/whats-new");
  }

  return (
    <div className="sticky top-[var(--header-height)] z-40 h-[var(--search-row-height)] overflow-hidden border-b bg-background shadow-sm transition-[height] duration-300 ease-in-out">
      <div className="flex h-16 items-center px-4 lg:px-8">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
          className="relative w-full max-w-md"
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
      </div>
    </div>
  );
}
