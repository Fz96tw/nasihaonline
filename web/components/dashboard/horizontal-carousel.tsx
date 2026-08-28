"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Horizontal snap-scroll shell shared by the dashboard's "What's Trending"
 * and "Your Schedule" carousels — same markup at every breakpoint. Chevrons
 * stay always-visible below sm (touch has no hover state, so they're the
 * scrollability hint there); at sm+ they hover-reveal for mouse/trackpad
 * users, since a plain mouse has no native horizontal-scroll gesture. Each
 * chevron disables itself once there's nothing left to scroll to in that
 * direction, instead of staying clickable past the first/last item.
 *
 * `storageKey` must be unique per carousel instance on the page — scroll
 * position is persisted to sessionStorage (rather than kept in React state)
 * because clicking a card/link inside can navigate away to a different
 * route, which remounts this component; sessionStorage survives that so
 * returning via back link lands where you left off instead of snapping back
 * to the start.
 */
export function HorizontalCarousel({
  children,
  storageKey,
}: {
  children: React.ReactNode;
  storageKey: string;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Runs before paint so the restored position doesn't flash from 0. Uses
  // "instant" rather than assigning scrollLeft directly because the
  // scroller's CSS scroll-behavior is smooth, which would otherwise animate
  // the restore into a visible slide.
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const saved = Number(sessionStorage.getItem(storageKey));
    if (saved > 0) el.scrollTo({ left: saved, behavior: "instant" });
  }, [storageKey]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    function updateScrollState() {
      if (!el) return;
      setCanScrollLeft(el.scrollLeft > 1);
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
      sessionStorage.setItem(storageKey, String(el.scrollLeft));
    }

    updateScrollState();
    el.addEventListener("scroll", updateScrollState, { passive: true });
    window.addEventListener("resize", updateScrollState);
    return () => {
      el.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
    };
  }, [storageKey]);

  function scrollByItem(direction: 1 | -1) {
    const el = scrollerRef.current;
    if (!el) return;
    const item = el.querySelector<HTMLElement>("[data-carousel-item]");
    const amount = (item?.offsetWidth ?? 280) + 16;
    el.scrollBy({ left: direction * amount, behavior: "smooth" });
  }

  return (
    <div className="group relative">
      <div
        ref={scrollerRef}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
      <button
        type="button"
        aria-label="Scroll left"
        onClick={() => scrollByItem(-1)}
        disabled={!canScrollLeft}
        className={cn(
          "absolute left-0 top-1/2 flex -translate-x-2 -translate-y-1/2 rounded-full border bg-background p-1.5 shadow-md transition-opacity",
          canScrollLeft ? "opacity-100 sm:opacity-0 sm:group-hover:opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label="Scroll right"
        onClick={() => scrollByItem(1)}
        disabled={!canScrollRight}
        className={cn(
          "absolute right-0 top-1/2 flex -translate-y-1/2 translate-x-2 rounded-full border bg-background p-1.5 shadow-md transition-opacity",
          canScrollRight ? "opacity-100 sm:opacity-0 sm:group-hover:opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
