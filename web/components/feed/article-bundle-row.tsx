"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, Eye, MessageSquare, Newspaper } from "lucide-react";
import { type FeedItem, FEED_TYPE_LABELS } from "@/lib/feed";
import { formatRelativeTime } from "@/lib/format-date";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ArticleDiscussButton } from "@/components/feed/article-row-actions";
import { cn } from "@/lib/utils";

/** How long each slide stays up before the carousel moves on by itself. */
const AUTO_ADVANCE_MS = 3000;
/** After a swipe, arrow or dot click, auto-advance waits this long. */
const USER_PAUSE_MS = 5000;

/**
 * What's New's single "From the Web" row (§4.18): the newest curated articles
 * as a carousel, newest first, ending in a "See all" slide. Auto-advances
 * every AUTO_ADVANCE_MS — paused for USER_PAUSE_MS after the member swipes or
 * clicks an arrow/dot, and while the row is off screen, hovered, focused, the
 * tab is hidden, or the viewer prefers reduced motion. Tapping a slide opens
 * the article; the Discuss button beside the dots follows the slide in view.
 */
export function ArticleBundleRow({ item }: { item: FeedItem & { articleBundle: NonNullable<FeedItem["articleBundle"]> } }) {
  const { slides, seeAllHref } = item.articleBundle;
  const slideCount = slides.length + 1; // + the "See all" slide
  const rootRef = useRef<HTMLLIElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const activeRef = useRef(0);
  const pausedUntil = useRef(0);
  const holding = useRef({ hover: false, focus: false, offscreen: true });

  const pauseForUser = () => {
    pausedUntil.current = Date.now() + USER_PAUSE_MS;
  };

  // `instant` for the auto-advance wrap from the "See all" slide back to the
  // first article — a smooth scroll there visibly rewinds past every slide.
  const scrollToIndex = (i: number, instant = false) => {
    const el = scrollerRef.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: instant ? "instant" : "smooth" });
  };

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(([entry]) => {
      holding.current.offscreen = !entry.isIntersecting || entry.intersectionRatio < 0.5;
    }, { threshold: [0, 0.5, 1] });
    observer.observe(root);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const timer = window.setInterval(() => {
      const { hover, focus, offscreen } = holding.current;
      if (reduceMotion.matches || document.hidden || hover || focus || offscreen) return;
      if (Date.now() < pausedUntil.current) return;
      const next = (activeRef.current + 1) % slideCount;
      scrollToIndex(next, next === 0);
    }, AUTO_ADVANCE_MS);
    return () => {
      observer.disconnect();
      window.clearInterval(timer);
    };
  }, [slideCount]);

  const current = slides[active];

  return (
    <li
      ref={rootRef}
      onMouseEnter={() => (holding.current.hover = true)}
      onMouseLeave={() => (holding.current.hover = false)}
      onFocus={() => (holding.current.focus = true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) holding.current.focus = false;
      }}
    >
      <div className="p-4">
        <div className="flex items-start gap-2">
          <Avatar name={item.author.name ?? "NASIHA"} src={item.author.avatarUrl} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-base font-medium">{item.author.name}</span>
              <Badge variant="neutral" className="flex-shrink-0">
                {FEED_TYPE_LABELS.article}
              </Badge>
              <span className="ml-auto flex-shrink-0 text-xs text-muted-foreground">
                {formatRelativeTime(current?.timestamp ?? item.timestamp)}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              {slides.length === 1 ? "1 new article" : `${slides.length} latest articles`}
            </div>
          </div>
        </div>

        <div className="group relative mt-3">
          <div
            ref={scrollerRef}
            data-no-swipe
            aria-roledescription="carousel"
            aria-label="From the Web articles"
            onPointerDown={pauseForUser}
            onTouchStart={pauseForUser}
            onWheel={(e) => {
              if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) pauseForUser();
            }}
            onScroll={(e) => {
              const el = e.currentTarget;
              const i = Math.round(el.scrollLeft / el.clientWidth);
              activeRef.current = i;
              setActive(i);
            }}
            className="flex snap-x snap-mandatory overflow-x-auto rounded-md [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {slides.map((slide, i) => (
              <a
                key={slide.articleId}
                href={slide.url}
                target="_blank"
                rel="noopener noreferrer"
                draggable={false}
                aria-label={`${slide.title} (${slide.sourceName}, opens in a new tab)`}
                className="flex w-full shrink-0 snap-center flex-col overflow-hidden rounded-md border bg-card transition-colors hover:bg-accent/50"
              >
                {/* Title overlaid on the image over a dark gradient (like Library's overlay option), so long headlines get 3 lines without growing the card. */}
                <div className="relative aspect-video w-full bg-muted sm:aspect-[8/3]">
                  {/* eslint-disable-next-line @next/next/no-img-element -- MinIO-proxied URL, see Avatar's same rationale */}
                  <img
                    src={slide.imageUrl}
                    alt=""
                    draggable={false}
                    loading={i === 0 ? "eager" : "lazy"}
                    className="absolute inset-0 h-full w-full object-cover object-center"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent" aria-hidden />
                  {/* Padding on the wrapper, not the clamped h3 — padding there would show a 4th line peeking out. */}
                  <div className="absolute inset-x-0 bottom-0 p-3">
                    <h3 className="line-clamp-3 text-lg font-semibold leading-snug text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
                      {slide.title}
                    </h3>
                  </div>
                </div>
                <div className="flex flex-1 flex-col gap-1 p-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="min-w-0 truncate">{slide.sourceName}</span>
                    {slide.communities?.length ? (
                      <Badge className="ml-auto flex-shrink-0 bg-primary/10 text-primary" title={slide.communities.join(", ")}>
                        {slide.communities[0]}
                        {slide.communities.length > 1 && <span className="ml-1">+{slide.communities.length - 1}</span>}
                      </Badge>
                    ) : null}
                  </div>
                  {slide.excerpt && <p className="line-clamp-2 text-sm text-muted-foreground">{slide.excerpt}</p>}
                  <div className="mt-auto flex items-center justify-end gap-3 pt-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1" title="Members who opened this article">
                      <Eye className="h-3.5 w-3.5" />
                      {slide.viewCount}
                    </span>
                    {slide.threadHref && (
                      <span className="flex items-center gap-1" title="Discussion thread replies">
                        <MessageSquare className="h-3.5 w-3.5" />
                        {slide.replyCount}
                      </span>
                    )}
                  </div>
                </div>
              </a>
            ))}
            <Link
              href={seeAllHref}
              draggable={false}
              className="flex w-full shrink-0 snap-center flex-col items-center justify-center gap-3 rounded-md border bg-primary/5 p-6 text-center transition-colors hover:bg-primary/10"
            >
              <Newspaper className="h-10 w-10 text-primary" aria-hidden />
              <span className="text-lg font-semibold">See all From the Web articles</span>
              <span className="flex items-center gap-1 text-sm font-medium text-primary">
                Browse the archive <ArrowRight className="h-4 w-4" aria-hidden />
              </span>
            </Link>
          </div>
          {/* Mouse-only: touch users swipe, and the buttons would just cover the photo. */}
          {([-1, 1] as const).map((dir) => {
            const target = active + dir;
            if (target < 0 || target >= slideCount) return null;
            const Icon = dir < 0 ? ChevronLeft : ChevronRight;
            return (
              <button
                key={dir}
                type="button"
                aria-label={dir < 0 ? "Previous article" : "Next article"}
                onClick={() => {
                  pauseForUser();
                  scrollToIndex(target);
                }}
                className={cn(
                  "absolute top-[28%] hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70 [@media(pointer:fine)]:flex",
                  dir < 0 ? "left-2" : "right-2",
                )}
              >
                <Icon className="h-5 w-5" />
              </button>
            );
          })}
        </div>
        {/* Dots centered, the slide's Discuss button on the right of the same line (the slide itself opens the article). */}
        <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <span />
          <div className="flex justify-center gap-1.5" role="tablist" aria-label="Articles">
            {Array.from({ length: slideCount }, (_, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === active}
                aria-label={i < slides.length ? `Article ${i + 1} of ${slides.length}` : "See all articles"}
                onClick={() => {
                  pauseForUser();
                  scrollToIndex(i);
                }}
                className={cn("h-1.5 w-1.5 rounded-full transition-colors", i === active ? "bg-primary" : "bg-muted-foreground/30")}
              />
            ))}
          </div>
          <div className="flex min-h-9 justify-end">
            {current && <ArticleDiscussButton key={current.articleId} article={current} />}
          </div>
        </div>
      </div>
    </li>
  );
}
