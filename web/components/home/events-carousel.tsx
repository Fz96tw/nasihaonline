"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { FeedEventDateBadge } from "@/components/feed/feed-event-date-badge";
import { cn } from "@/lib/utils";

/** How long each slide stays up before the carousel moves on by itself. */
const AUTO_ADVANCE_MS = 3000;
/** After a swipe, arrow or dot click, auto-advance waits this long. */
const USER_PAUSE_MS = 5000;
/** Shown for an event with no uploaded banner. */
const FALLBACK_IMAGE = "/images/events.jpg";

export type EventSlide = {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  imageUrl: string | null;
  href: string;
};

/**
 * The homepage's Events Calendar carousel: one full-width slide per upcoming
 * public event (banner, title and the first lines of the description overlaid
 * on a dark gradient, the calendar-tile date badge), earliest first. Tapping a slide opens the event's page.
 *
 * Same auto-advance rules as What's New's From the Web row (ArticleBundleRow):
 * every AUTO_ADVANCE_MS, wrapping from the last slide back to the first;
 * paused for USER_PAUSE_MS after a swipe or arrow/dot click, and while the
 * carousel is off screen, hovered, focused, the tab is hidden, or the viewer
 * prefers reduced motion. It stops for good once a same-tab link is followed:
 * Next 14's router re-issues a pending navigation's fetch whenever the page
 * re-renders mid-navigation, so a slide change every few seconds kept
 * restarting it (that row's navigations took 20+ seconds before this).
 */
export function EventsCarousel({ slides }: { slides: EventSlide[] }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const activeRef = useRef(0);
  const pausedUntil = useRef(0);
  const holding = useRef({ hover: false, focus: false, offscreen: true });
  const stopped = useRef(false);
  const slideCount = slides.length;

  const pauseForUser = () => {
    pausedUntil.current = Date.now() + USER_PAUSE_MS;
  };

  // `instant` for the wrap from the last slide back to the first — a smooth
  // scroll there visibly rewinds past every slide.
  const scrollToIndex = (i: number, instant = false) => {
    const el = scrollerRef.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: instant ? "instant" : "smooth" });
  };

  useEffect(() => {
    const root = rootRef.current;
    if (!root || slideCount < 2) return;
    const observer = new IntersectionObserver(([entry]) => {
      holding.current.offscreen = !entry.isIntersecting || entry.intersectionRatio < 0.5;
    }, { threshold: [0, 0.5, 1] });
    observer.observe(root);
    // Capture phase, so this runs before next/link starts the navigation.
    const onDocumentClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (anchor && anchor.getAttribute("target") !== "_blank") stopped.current = true;
    };
    document.addEventListener("click", onDocumentClick, true);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const timer = window.setInterval(() => {
      const { hover, focus, offscreen } = holding.current;
      if (stopped.current || reduceMotion.matches || document.hidden || hover || focus || offscreen) return;
      if (Date.now() < pausedUntil.current) return;
      const next = (activeRef.current + 1) % slideCount;
      scrollToIndex(next, next === 0);
    }, AUTO_ADVANCE_MS);
    return () => {
      observer.disconnect();
      document.removeEventListener("click", onDocumentClick, true);
      window.clearInterval(timer);
    };
  }, [slideCount]);

  return (
    <div
      ref={rootRef}
      onMouseEnter={() => (holding.current.hover = true)}
      onMouseLeave={() => (holding.current.hover = false)}
      onFocus={() => (holding.current.focus = true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) holding.current.focus = false;
      }}
    >
      <div className="group relative">
        <div
          ref={scrollerRef}
          aria-roledescription="carousel"
          aria-label="Upcoming events"
          onPointerDown={pauseForUser}
          onTouchStart={pauseForUser}
          onWheel={(e) => {
            if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) pauseForUser();
          }}
          onScroll={(e) => {
            const el = e.currentTarget;
            const i = Math.round(el.scrollLeft / el.clientWidth);
            if (i === activeRef.current) return;
            activeRef.current = i;
            setActive(i);
          }}
          className="flex snap-x snap-mandatory overflow-x-auto rounded-xl shadow-lg [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {slides.map((slide, i) => (
            <Link
              key={slide.id}
              href={slide.href}
              draggable={false}
              aria-roledescription="slide"
              aria-label={`${slide.title} — event ${i + 1} of ${slideCount}`}
              className="relative block aspect-square w-full shrink-0 snap-center overflow-hidden bg-muted sm:aspect-[5/2]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- MinIO-proxied URL, see Avatar's same rationale */}
              <img
                src={slide.imageUrl ?? FALLBACK_IMAGE}
                alt=""
                draggable={false}
                loading={i === 0 ? "eager" : "lazy"}
                className="absolute inset-0 h-full w-full object-cover object-center"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-transparent" aria-hidden />
              <FeedEventDateBadge startsAt={slide.startsAt} endsAt={slide.endsAt ?? undefined} variant="overlay" />
              {/* Padding on the wrapper, not the clamped h3 — padding there would show an extra line peeking out. */}
              {/* Extra side padding on mouse devices keeps the text clear of the prev/next arrows. */}
              <div className="absolute inset-x-0 bottom-0 p-5 sm:p-8 [@media(pointer:fine)]:px-16 sm:[@media(pointer:fine)]:px-20">
                <h3 className="line-clamp-2 max-w-[820px] text-xl font-extrabold leading-tight text-white [text-shadow:0_2px_10px_rgba(0,0,0,.75)] sm:text-3xl lg:text-4xl">
                  {slide.title}
                </h3>
                {slide.description && (
                  <p className="mt-2 line-clamp-2 max-w-[720px] text-sm leading-relaxed text-white/90 [text-shadow:0_1px_6px_rgba(0,0,0,.8)] sm:line-clamp-3 sm:text-base">
                    {slide.description}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
        {/* Mouse-only: touch users swipe, and the buttons would just cover the photo. Wrap around at either end. */}
        {slideCount > 1 &&
          ([-1, 1] as const).map((dir) => {
            const Icon = dir < 0 ? ChevronLeft : ChevronRight;
            return (
              <button
                key={dir}
                type="button"
                aria-label={dir < 0 ? "Previous event" : "Next event"}
                onClick={() => {
                  pauseForUser();
                  const target = (active + dir + slideCount) % slideCount;
                  scrollToIndex(target, Math.abs(target - active) > 1);
                }}
                className={cn(
                  "absolute top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-colors hover:bg-black/70 [@media(pointer:fine)]:flex",
                  dir < 0 ? "left-3" : "right-3",
                )}
              >
                <Icon className="h-6 w-6" />
              </button>
            );
          })}
      </div>
      {slideCount > 1 && (
        <div className="mt-4 flex flex-wrap justify-center gap-2" role="tablist" aria-label="Events">
          {slides.map((slide, i) => (
            <button
              key={slide.id}
              type="button"
              role="tab"
              aria-selected={i === active}
              aria-label={`Event ${i + 1} of ${slideCount}: ${slide.title}`}
              onClick={() => {
                pauseForUser();
                scrollToIndex(i);
              }}
              className={cn(
                "h-2 rounded-full transition-all",
                i === active ? "w-6 bg-primary" : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50",
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
