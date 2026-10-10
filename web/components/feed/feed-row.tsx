"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Eye, Hand, Lock, MessageSquare, Newspaper, Play, Users } from "lucide-react";
import { type FeedGallerySlide, type FeedItem, FEED_TYPE_LABELS } from "@/lib/feed";
import { formatRelativeTime } from "@/lib/format-date";
import { DIRECTORY_TIER_LABELS, TIER_BADGE_VARIANT } from "@/lib/members";
import { Avatar } from "@/components/ui/avatar";
import { FollowMemberButton } from "@/components/members/follow-member-button";
import { Badge } from "@/components/ui/badge";
import { ReviewOfferButton } from "@/components/review/review-offer-button";
import { HighlightText } from "@/components/highlight-text";
import { useHasMounted } from "@/lib/use-has-mounted";
import { cn } from "@/lib/utils";
import { ReflectionFeedCard } from "@/components/feed/reflection-feed-card";

/**
 * Pasted-image strip for a forum-thread feed row. One image renders as a
 * plain full-width image; 2+ become a horizontal scroll-snap carousel (touch
 * swipe / trackpad) with clickable dots below it. The row is wrapped in a
 * <Link>, so dot clicks are swallowed to avoid navigating. The strip is
 * data-no-swipe so a sideways drag on it scrolls the images instead of also
 * starting PaneSlider's pane swipe.
 */
function FeedImageCarousel({ slides, firstSlideOverlay }: { slides: FeedGallerySlide[]; firstSlideOverlay?: ReactNode }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  // A video slide fixes every slide to 16:9 so the row doesn't change height as you swipe between a video and a photo.
  const hasVideo = slides.some((slide) => slide.kind === "video");

  const scrollToIndex = (i: number) => {
    const el = scrollerRef.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  };

  if (slides.length === 1 && slides[0].kind === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- MinIO-proxied URL (access-gated per request), see Avatar's same rationale
      <img src={slides[0].url} alt="" className="mt-2 max-h-48 w-full rounded-md bg-muted object-contain" />
    );
  }

  return (
    <div className="mt-2">
      <div className="group relative">
        <div
          ref={scrollerRef}
          data-no-swipe
          onScroll={(e) => {
            const el = e.currentTarget;
            setActive(Math.round(el.scrollLeft / el.clientWidth));
          }}
          className="flex snap-x snap-mandatory overflow-x-auto rounded-md [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {slides.map((slide, i) => (
            <div
              key={`${i}-${slide.kind === "image" ? slide.url : slide.embedUrl}`}
              className={cn("relative w-full shrink-0 snap-center bg-muted", hasVideo ? "aspect-video" : "h-48")}
            >
              {slide.kind === "video" ? (
                <FeedYoutubePlayer
                  thumbnailUrl={slide.thumbnailUrl}
                  embedUrl={slide.embedUrl}
                  embedded
                  autoplay={i === 0}
                  slideActive={i === active}
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- MinIO-proxied URL (access-gated per request), see Avatar's same rationale
                <img
                  src={slide.url}
                  alt=""
                  draggable={false}
                  loading={i === 0 ? "eager" : "lazy"}
                  className="block h-full w-full object-contain"
                />
              )}
              {i === 0 && slide.kind === "image" && firstSlideOverlay}
            </div>
          ))}
        </div>
        {/* Mouse-only: touch users swipe, and the buttons would just cover the photo. */}
        {([-1, 1] as const).map((dir) => {
          const target = active + dir;
          if (target < 0 || target >= slides.length) return null;
          const Icon = dir < 0 ? ChevronLeft : ChevronRight;
          return (
            <button
              key={dir}
              type="button"
              aria-label={dir < 0 ? "Previous slide" : "Next slide"}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                scrollToIndex(target);
              }}
              className={cn(
                "absolute top-1/2 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70 [@media(pointer:fine)]:flex",
                dir < 0 ? "left-2" : "right-2",
              )}
            >
              <Icon className="h-5 w-5" />
            </button>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-center gap-1.5" role="tablist" aria-label="Slides">
        {slides.map((_, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={i === active}
            aria-label={`Slide ${i + 1} of ${slides.length}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              scrollToIndex(i);
            }}
            className={cn(
              "h-1.5 w-1.5 rounded-full transition-colors",
              i === active ? "bg-primary" : "bg-muted-foreground/30",
            )}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * YouTube player for a feed row. Autoplays muted (the only autoplay browsers
 * allow) once the row is mostly on screen, and pauses/resumes via the
 * iframe API's postMessage commands as it scrolls out of/back into view —
 * the iframe is mounted once, so progress isn't lost. Falls back to a
 * click-to-play thumbnail under prefers-reduced-motion. The row is wrapped
 * in a <Link>, so the facade's click is swallowed (no navigation); the
 * iframe captures its own clicks.
 */
function FeedYoutubePlayer({
  thumbnailUrl,
  embedUrl,
  embedded = false,
  autoplay = true,
  slideActive = true,
}: {
  thumbnailUrl: string;
  embedUrl: string;
  /** Rendered as a carousel slide: fills its parent instead of carrying its own margin/rounding. */
  embedded?: boolean;
  /** Mount and play on scrolling into view; false waits for a click (a non-first carousel slide). */
  autoplay?: boolean;
  /** False while the carousel shows another slide — pauses the video. */
  slideActive?: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  const [inView, setInView] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const reduceMotion = useRef(false);

  useEffect(() => {
    reduceMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const el = containerRef.current;
    if (!el || reduceMotion.current) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.6 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const shouldPlay = slideActive && (inView || reduceMotion.current);

  useEffect(() => {
    if (autoplay && inView && slideActive) setMounted(true);
  }, [autoplay, inView, slideActive]);

  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: "command", func: shouldPlay ? "playVideo" : "pauseVideo", args: "" }),
      "https://www.youtube.com",
    );
  }, [shouldPlay]);

  return (
    <div
      ref={containerRef}
      className={cn("aspect-video w-full overflow-hidden bg-black", embedded ? "h-full" : "mt-2 rounded-md")}
    >
      {mounted ? (
        <iframe
          ref={iframeRef}
          src={`${embedUrl}?autoplay=1&mute=1&playsinline=1&enablejsapi=1`}
          title="YouTube video"
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <button
          type="button"
          aria-label="Play video"
          className="relative block h-full w-full"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setMounted(true);
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- external YouTube thumbnail */}
          <img src={thumbnailUrl} alt="" className="h-full w-full object-cover" />
          <span className="absolute inset-0 flex items-center justify-center bg-black/20">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/70 text-white">
              <Play className="h-6 w-6 fill-current" />
            </span>
          </span>
        </button>
      )}
    </div>
  );
}

// Deliberately not lib/format-date.ts's formatTimestamp: that's a generic
// "when did this happen" formatter shared by ~20 unrelated call sites
// (forum posts, chat messages, admin tables) where labeling the zone would
// be noise. This is specifically an event's *scheduled* start time — same
// category as event-detail.tsx/event-card.tsx/event-list-item.tsx/
// public-event-detail.tsx, so it gets the same timeZoneName: "short"
// treatment. No explicit `timeZone` here means it already converts to the
// viewer's own browser zone; the abbreviation just confirms that.
function formatFeedEventDate(iso: string) {
  const date = new Date(iso);
  const datePart = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const timePart = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  return `${datePart}, ${timePart}`;
}

export function FeedRow({ item, q, currentUserId }: { item: FeedItem; q?: string; currentUserId?: string }) {
  // Guards the one viewer-zone-dependent value below (formatFeedEventDate)
  // so the server-rendered HTML (server's own zone) and the client's first
  // hydration pass render the same "nothing yet", same rationale as
  // event-list-item.tsx's identical guard on its own event date line.
  const hasMounted = useHasMounted();
  const subtitle = [item.author.titleSpecialty, item.author.countryRegion].filter(Boolean).join(", ");
  // A Weekly Reflection thread's own row is a full-panel image look instead of
  // the standard layout (after the hooks above, so hook order is unchanged).
  if (item.reflectionCard) return <ReflectionFeedCard item={{ ...item, reflectionCard: item.reflectionCard }} q={q} />;
  // Forum threads always carry the same static default image (no per-thread
  // upload), so instead of the full-width hero image other feed types render
  // below their content, it's shown as a small dimmed square in the
  // top-right corner, with the title/excerpt text overlaid on top of it.
  // Exception: when the previewed post embeds a pasted image, that renders
  // full-width below (like other feed types) and the corner square is
  // dropped to avoid showing two images for the same row.
  const isForumThread = item.type === "forum_thread";
  const hasThreadYoutube = isForumThread && !item.bodyImageUrl && !!item.youtubeEmbedUrl && !!item.youtubeThumbnailUrl;
  const hasThreadImage = isForumThread && !!item.imageUrl && !item.bodyImageUrl && !hasThreadYoutube;
  // Library items opted into the title-overlay treatment (§ Library hero
  // banner title overlay option) show the title on the image instead of in
  // the text block above it, mirroring the detail page/browse card.
  const isLibraryOverlay = item.type === "library" && !!item.showTitleOverlay && !!item.imageUrl;
  // A Library/Event reply row (see lib/feed-server.ts's replyRow) — never
  // true for that item's own row (which never carries replyExcerpt now) or
  // for a forum_thread's own bumped row (which has its own, already-correct
  // title-first order below). Confirmed with user: read top to bottom as
  // "<member> replied in the resource/event discussion", then the original
  // item's title (smaller, the base text-base size, not the
  // usual large Library/Event title), then the quoted reply — the reverse
  // of every other row's title-then-excerpt order.
  const isDiscussionReplyRow = (item.type === "library" || item.type === "event") && !!item.replyExcerpt;

  return (
    <li>
      <Link
        href={item.href}
        className={cn(
          "flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-accent/50",
          item.reviewOfferPrompt && "pb-2",
        )}
      >
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start gap-2">
            <Avatar name={item.author.name ?? "NASIHA Member"} src={item.author.avatarUrl} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-base font-medium">
                  {item.author.name ? <HighlightText text={item.author.name} query={q} /> : "NASIHA Member"}
                </span>
                <Badge variant="neutral" className="flex-shrink-0">
                  {FEED_TYPE_LABELS[item.type]}
                </Badge>
                {item.author.id && item.author.id !== currentUserId && (
                  // Sits inside the card's <Link>: swallow the click so
                  // following doesn't also navigate to the item.
                  <span
                    className="flex-shrink-0"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                  >
                    <FollowMemberButton
                      memberId={item.author.id}
                      memberName={item.author.name ?? "this member"}
                      variant="nudge"
                    />
                  </span>
                )}
                <span className="ml-auto flex-shrink-0 text-xs text-muted-foreground">
                  {formatRelativeTime(item.timestamp)}
                </span>
              </div>
              {subtitle && <div className="truncate text-xs text-muted-foreground">{subtitle}</div>}
            </div>
          </div>
          <div className="min-w-0 flex-1">
            {isLibraryOverlay ? (
              <>
                {/* Banner (with the title overlaid on it) comes first for a
                    library item with the overlay on — the excerpt reads as a
                    caption under the banner, mirroring the detail page's
                    image-then-content order, instead of sitting above it. */}
                {item.gallery ? (
                  <FeedImageCarousel
                    slides={item.gallery}
                    firstSlideOverlay={
                      <>
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                        <p className="absolute inset-x-0 bottom-3 line-clamp-4 px-4 text-2xl font-bold text-white [text-shadow:0_2px_10px_rgba(0,0,0,.75)]">
                          {item.isRestricted && (
                            <Lock className="mr-2 inline h-5 w-5 align-[-2px]" aria-label="Restricted resource" />
                          )}
                          {item.title}
                        </p>
                      </>
                    }
                  />
                ) : (
                  <div className="relative mt-2 w-full overflow-hidden rounded-md">
                    {/* eslint-disable-next-line @next/next/no-img-element -- MinIO-proxied URL, see Avatar's same rationale */}
                    <img src={item.imageUrl!} alt="" className="max-h-48 w-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                    <p className="absolute inset-x-0 bottom-3 line-clamp-4 px-4 text-2xl font-bold text-white [text-shadow:0_2px_10px_rgba(0,0,0,.75)]">
                      {item.isRestricted && (
                        <Lock className="mr-2 inline h-5 w-5 align-[-2px]" aria-label="Restricted resource" />
                      )}
                      {item.title}
                    </p>
                  </div>
                )}
                <div className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                  <HighlightText text={item.excerpt} query={q} />
                </div>
              </>
            ) : (
              <>
                <div className="flex items-start gap-1">
                  <div className={cn("mt-2 min-w-0 flex-1", hasThreadImage && "relative")}>
                    {hasThreadImage && (
                      <div className="absolute right-0 top-0 aspect-square w-[9%] overflow-hidden rounded-md">
                        {/* eslint-disable-next-line @next/next/no-img-element -- MinIO-proxied URL, see Avatar's same rationale */}
                        <img src={item.imageUrl!} alt="" className="h-full w-full object-cover" />
                        <div className="absolute inset-0 bg-white/70" />
                      </div>
                    )}
                    <div className={cn(hasThreadImage && "relative z-10")}>
                      {isDiscussionReplyRow && (
                        <div
                          className={cn(
                            "line-clamp-2 text-sm",
                            hasThreadImage ? "text-neutral-800" : "text-muted-foreground",
                          )}
                        >
                          <HighlightText text={item.excerpt} query={q} />
                        </div>
                      )}
                      <div className={cn("flex items-center gap-2", isDiscussionReplyRow && "mt-0.5")}>
                        {item.isRestricted && (
                          <Lock
                            className={cn(
                              "h-4 w-4 flex-shrink-0",
                              hasThreadImage ? "text-neutral-900" : "text-muted-foreground",
                            )}
                            aria-label={`Restricted ${item.type === "library" ? "resource" : item.type === "forum_thread" ? "thread" : "event"}`}
                          />
                        )}
                        {item.isDigest && (
                          <Newspaper className="h-4 w-4 flex-shrink-0 text-primary" aria-label="Weekly digest" />
                        )}
                        <span
                          className={cn(
                            // Library/Event items without the title-overlay
                            // banner treatment (isLibraryOverlay above) still
                            // get the overlay's text-2xl/font-bold size — the
                            // title shouldn't read smaller just because
                            // there's no hero image/overlay to put it on.
                            // Events match the same size (confirmed with
                            // user) so the two hero-image-bearing feed types
                            // read consistently. Exception: a discussion
                            // reply row's title is the original item's, not
                            // this row's own — sized at the base
                            // text-base instead (isDiscussionReplyRow above).
                            // Forum threads match too (confirmed with user), but
                            // not their reply rows (item.isReply), which stay small.
                            !isDiscussionReplyRow &&
                              (item.type === "library" || item.type === "event" || (item.type === "forum_thread" && !item.isReply))
                              ? "text-2xl font-bold"
                              : "text-base font-semibold",
                            hasThreadImage && "text-neutral-900",
                          )}
                        >
                          <HighlightText text={item.title} query={q} />
                        </span>
                        {item.titleTier && (
                          <Badge variant={TIER_BADGE_VARIANT[item.titleTier]} className="flex-shrink-0">
                            {DIRECTORY_TIER_LABELS[item.titleTier]}
                          </Badge>
                        )}
                      </div>
                      {!isDiscussionReplyRow && (
                        <div
                          className={cn(
                            "mt-0.5 line-clamp-2 text-sm",
                            hasThreadImage ? "text-neutral-800" : "text-muted-foreground",
                          )}
                        >
                          <HighlightText text={item.excerpt} query={q} />
                        </div>
                      )}
                      {item.replyExcerpt && (
                        <div
                          className={cn(
                            "mt-1 line-clamp-2 text-sm italic",
                            hasThreadImage ? "text-neutral-800" : "text-muted-foreground",
                          )}
                        >
                          &ldquo;<HighlightText text={item.replyExcerpt} query={q} />&rdquo;
                        </div>
                      )}
                      {item.volunteerNote && (
                        <div
                          className={cn(
                            "mt-1 line-clamp-2 text-xs italic",
                            hasThreadImage ? "text-neutral-800" : "text-muted-foreground",
                          )}
                        >
                          Looking for: <HighlightText text={item.volunteerNote} query={q} />
                        </div>
                      )}
                      {item.eventStartsAt && (
                        <div
                          className={cn(
                            "mt-0.5 text-xs",
                            hasThreadImage ? "text-neutral-800" : "text-muted-foreground",
                          )}
                        >
                          Event Date: {hasMounted ? formatFeedEventDate(item.eventStartsAt) : null}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                {!isForumThread && !item.gallery && item.imageUrl && item.youtubeEmbedUrl && (
                  <FeedYoutubePlayer thumbnailUrl={item.imageUrl} embedUrl={item.youtubeEmbedUrl} />
                )}
                {!isForumThread && item.gallery && !isLibraryOverlay && (
                  <FeedImageCarousel slides={item.gallery} />
                )}
                {!isForumThread && item.imageUrl && !item.youtubeEmbedUrl && !item.gallery && (
                  // eslint-disable-next-line @next/next/no-img-element -- MinIO-proxied URL, see Avatar's same rationale
                  <img
                    src={item.imageUrl}
                    alt=""
                    className="mt-2 max-h-48 w-full rounded-md bg-muted object-contain"
                  />
                )}
              </>
            )}
            {hasThreadYoutube && (
              <FeedYoutubePlayer thumbnailUrl={item.youtubeThumbnailUrl!} embedUrl={item.youtubeEmbedUrl!} />
            )}
            {isForumThread && item.bodyImageUrl && (
              <FeedImageCarousel
                slides={(item.bodyImageUrls?.length ? item.bodyImageUrls : [item.bodyImageUrl]).map((url) => ({ kind: "image" as const, url }))}
              />
            )}
            {item.stats && (
              <div className="mt-2 flex items-center justify-end gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1" title="Unique visitors">
                  <Eye className="h-3.5 w-3.5" />
                  {item.stats.views}
                </span>
                <span className="flex items-center gap-1" title="Comments">
                  <MessageSquare className="h-3.5 w-3.5" />
                  {item.stats.comments}
                </span>
              </div>
            )}
            {item.libraryViewCount !== undefined && (
              <div className="mt-2 flex items-center justify-end gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1" title="Unique visitors">
                  <Eye className="h-3.5 w-3.5" />
                  {item.libraryViewCount}
                </span>
                {item.forumReplyCount !== undefined && (
                  <span className="flex items-center gap-1" title="Discussion thread replies">
                    <MessageSquare className="h-3.5 w-3.5" />
                    {item.forumReplyCount}
                  </span>
                )}
              </div>
            )}
            {item.attendeeCount !== undefined && (
              <div className="mt-2 flex items-center justify-end gap-3 text-xs text-muted-foreground">
                {item.eventViewCount !== undefined && (
                  <span className="flex items-center gap-1" title="Unique visitors">
                    <Eye className="h-3.5 w-3.5" />
                    {item.eventViewCount}
                  </span>
                )}
                <span className="flex items-center gap-1" title="Registered or RSVP'd">
                  <Users className="h-3.5 w-3.5" />
                  {item.attendeeCount}
                </span>
                {item.forumReplyCount !== undefined && (
                  <span className="flex items-center gap-1" title="Discussion thread replies">
                    <MessageSquare className="h-3.5 w-3.5" />
                    {item.forumReplyCount}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </Link>
      {item.reviewOfferPrompt && (
        <div className="flex items-center justify-between gap-3 py-0 pl-[60px] pr-4 pb-4">
          <span className="flex items-center gap-1 text-xs font-medium text-primary">
            <Hand className="h-3.5 w-3.5" />
            {item.reviewOfferPrompt}
          </span>
          {item.canOfferToReview && <ReviewOfferButton itemId={item.id} initialStatus={item.myOfferStatus ?? null} />}
        </div>
      )}
    </li>
  );
}
