"use client";

import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Horizontal snap-scroll shell for the mobile Stats row. Unlike
 * TrendingCarousel's hover-revealed chevrons, these stay permanently
 * visible below sm — there's no separate desktop scroll state to hint at
 * here, since sm+ drops the scroller entirely for the static 3-column grid
 * (hence the buttons being sm:hidden rather than hover-gated).
 */
export function StatsScroller({ children }: { children: React.ReactNode }) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  function scrollByCard(direction: 1 | -1) {
    const el = scrollerRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>("[data-stat-card]");
    const amount = (card?.offsetWidth ?? el.clientWidth) + 16;
    el.scrollBy({ left: direction * amount, behavior: "smooth" });
  }

  return (
    <div className="relative">
      <div
        ref={scrollerRef}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid sm:grid-cols-3 sm:overflow-visible sm:pb-0"
      >
        {children}
      </div>
      <button
        type="button"
        aria-label="Scroll left"
        onClick={() => scrollByCard(-1)}
        className="absolute left-0 top-1/2 flex -translate-x-2 -translate-y-1/2 rounded-full border bg-background p-1.5 shadow-md sm:hidden"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label="Scroll right"
        onClick={() => scrollByCard(1)}
        className="absolute right-0 top-1/2 flex -translate-y-1/2 translate-x-2 rounded-full border bg-background p-1.5 shadow-md sm:hidden"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
