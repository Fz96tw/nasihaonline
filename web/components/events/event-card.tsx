"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RsvpBlurb, RsvpButton } from "@/components/calendar/rsvp-button";
import { LiveEventBadge } from "@/components/events/live-event-badge";
import { FeedEventDateBadge } from "@/components/feed/feed-event-date-badge";
import { RegisterButton } from "@/components/events/register-button";
import { EVENT_TYPE_LABELS, getEventAudienceBadge, type EventWithRsvp } from "@/lib/events";
import { EventVisibility } from "@/lib/generated/prisma/enums";
import { useHasMounted } from "@/lib/use-has-mounted";
import { DEFAULT_EVENT_TIME_ZONE } from "@/lib/format-date";

function formatEventDayForHeading(startsAt: string): string {
  return new Date(startsAt).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: DEFAULT_EVENT_TIME_ZONE,
  });
}

// timeZoneName: "short" (e.g. "EDT") — no explicit `timeZone` above means
// this already converts to the viewer's own browser zone; the
// abbreviation just confirms that rather than leaving them to guess.
function formatEventDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

// Wraps the card's image/header/description in a Link when `href` is set,
// otherwise renders them unwrapped. Kept out of CardFooter's DOM subtree so
// its own interactive control (RsvpButton/RegisterButton/"Join to RSVP")
// never ends up nested inside this anchor.
function CardLinkWrapper({ href, children }: { href: string | null; children: React.ReactNode }) {
  if (!href) return <>{children}</>;
  return (
    <Link href={href} className="flex flex-1 flex-col">
      {children}
    </Link>
  );
}

/**
 * The description clamped to 3 lines, with "Read more" only when it actually
 * overflows (measured after layout, so a short description gets no link).
 * Links to the full event page rather than expanding in place: cards sit in
 * a grid, and one card growing would make its whole row jump. A signed-out
 * visitor's card is already one big link to /events/[id], so there it's
 * plain link-styled text (a nested <a> isn't allowed); a member's card isn't
 * wrapped, so it gets a real link to their /calendar/[id] view.
 */
function ClampedDescription({ text, readMoreHref }: { text: string; readMoreHref: string | null }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [overflows, setOverflows] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setOverflows(el.scrollHeight > el.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text]);

  return (
    <>
      <p ref={ref} className="line-clamp-3">
        {text}
      </p>
      {overflows &&
        (readMoreHref ? (
          <Link href={readMoreHref} className="mt-1 inline-block font-medium text-primary hover:underline">
            Read more
          </Link>
        ) : (
          <span className="mt-1 inline-block font-medium text-primary">Read more</span>
        ))}
    </>
  );
}

// The footer CTA branches three ways (§4.6): a members-only event drives
// "Join to RSVP" (signed out) or the RsvpButton /calendar also uses (signed
// in); an open event lets a signed-in member RSVP the same way, but a
// signed-out visitor instead gets the anonymous RegisterButton (no
// meetingUrl either way — that stays hidden on this public page per §4.6).
export function EventCard({ event, isSignedIn }: { event: EventWithRsvp; isSignedIn: boolean }) {
  const [rsvped, setRsvped] = useState(event.rsvped);
  const hasMounted = useHasMounted();
  const audienceBadge = getEventAudienceBadge(event);
  // A signed-out visitor gets a public detail page to click through to
  // (§4.6's /events/[eventId]) for any event, open or members-only — a
  // signed-in member already has the fuller /calendar/[eventId] view, so
  // this card itself stays non-interactive above its RSVP CTA for them.
  const detailHref = !isSignedIn ? `/events/${event.seriesId}` : null;

  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <CardLinkWrapper href={detailHref}>
        {event.heroImageUrl ? (
          // Fixed 2:1 frame (cropped to fill) rather than the upload's own
          // shape, so a tall/square banner can't stretch the card and every
          // card's text starts at the same height across a grid row.
          <div className="relative aspect-[2/1] w-full shrink-0 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element -- MinIO-proxied URL, see Avatar's same rationale */}
            <img src={event.heroImageUrl} alt="" className="h-full w-full object-cover object-center" />
            <div className="absolute inset-0 bg-[rgba(10,20,70,.4)]" />
            <FeedEventDateBadge startsAt={event.startsAt} endsAt={event.endsAt ?? undefined} variant="overlay" />
          </div>
        ) : null}
        <CardHeader>
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <LiveEventBadge eventId={event.seriesId} occurrenceId={event.id} />
            <Badge variant={audienceBadge.variant}>{audienceBadge.label}</Badge>
            <Badge variant="neutral">{EVENT_TYPE_LABELS[event.type]}</Badge>
            {event.isRecurring && event.recurrenceSummary ? (
              <Badge variant="neutral" title={event.recurrenceSummary}>
                Repeats
              </Badge>
            ) : null}
            {event.communities.map((community) => (
              <Badge key={community.id} variant="info">
                {community.name}
              </Badge>
            ))}
            {event.categories.map((category) => (
              <Badge key={category.id} variant="info">
                {category.name}
              </Badge>
            ))}
          </div>
          <CardTitle className="flex items-center gap-1.5 text-xl">
            {event.visibility === EventVisibility.invited && (
              <Lock className="h-4 w-4 flex-shrink-0 text-muted-foreground" aria-label="Restricted event" />
            )}
            {event.title}
            {/* Sessions of a recurring event, and separately created events
                that reuse a title (e.g. a weekly "Knowledge Exchange Hour"
                set up one by one), would otherwise give identical headings
                in a row, so every card's heading carries its date (SEO
                objective 4). A fixed timeZone keeps SSR and hydration in
                agreement; the visible, viewer-local date is the line below. */}
            <span className="sr-only">, {formatEventDayForHeading(event.startsAt)}</span>
          </CardTitle>
          {/* With a banner, the date badge on the image carries the date;
              the text line stays only for an image-less card. */}
          {!event.heroImageUrl && (
            <p className="text-sm text-muted-foreground">
              {hasMounted ? formatEventDate(event.startsAt) : null}
            </p>
          )}
          {event.hostName ? (
            <p className="text-sm text-muted-foreground">Hosted by {event.hostName}</p>
          ) : null}
        </CardHeader>
        {event.description ? (
          <CardContent className="pt-0 text-sm leading-relaxed text-muted-foreground">
            <ClampedDescription text={event.description} readMoreHref={detailHref ? null : `/calendar/${event.seriesId}`} />
          </CardContent>
        ) : null}
      </CardLinkWrapper>
      <CardFooter className="mt-auto flex-col items-start gap-1.5 pt-0">
        {isSignedIn ? (
          <>
            <RsvpButton eventId={event.seriesId} rsvped={rsvped} onToggled={(result) => setRsvped(result.rsvped)} />
            {!rsvped ? <RsvpBlurb className="text-xs text-muted-foreground" /> : null}
          </>
        ) : event.open ? (
          // The "no account needed / check your spam folder" note lives in
          // the Register dialog itself, not repeated on every card.
          <RegisterButton eventId={event.seriesId} eventTitle={event.title} />
        ) : (
          <Button size="sm" asChild>
            <Link href="/join">Join to RSVP</Link>
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
