"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Horizontal snap-scroll shell for the mobile Stats row. Unlike
 * TrendingCarousel's hover-revealed chevrons, these stay permanently
 * visible below sm — there's no separate desktop scroll state to hint at
 * here, since sm+ drops the scroller entirely for the static 3-column grid
 * (hence the buttons being sm:hidden rather than hover-gated). Each chevron
 * still disables itself once there's nothing left to scroll to in that
 * direction, same as TrendingCarousel.
 */
export function StatsScroller({ children }: { children: React.ReactNode }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    function updateScrollState() {
      if (!el) return;
      setCanScrollLeft(el.scrollLeft > 1);
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    }

    updateScrollState();
    el.addEventListener("scroll", updateScrollState, { passive: true });
    window.addEventListener("resize", updateScrollState);
    return () => {
      el.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
    };
  }, []);

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
        disabled={!canScrollLeft}
        className={cn(
          "absolute left-0 top-1/2 flex -translate-x-2 -translate-y-1/2 rounded-full border bg-background p-1.5 shadow-md transition-opacity sm:hidden",
          canScrollLeft ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label="Scroll right"
        onClick={() => scrollByCard(1)}
        disabled={!canScrollRight}
        className={cn(
          "absolute right-0 top-1/2 flex -translate-y-1/2 translate-x-2 rounded-full border bg-background p-1.5 shadow-md transition-opacity sm:hidden",
          canScrollRight ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
