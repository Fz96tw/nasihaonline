import Link from "next/link";
import { Reveal } from "@/components/home/reveal";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EventsCarousel, type EventSlide } from "@/components/home/events-carousel";
import { getPublicUpcomingEvents } from "@/lib/events-server";

function SectionHeading() {
  return (
    <Reveal className="mb-10 text-center">
      <p className="mb-3 text-sm font-bold uppercase tracking-[.1em] text-primary">Events Calendar</p>
      <h2 className="text-3xl font-extrabold tracking-[-.02em] md:text-4xl">Upcoming Events</h2>
      <p className="mx-auto mt-4 max-w-[640px] text-lg text-muted-foreground">
        Webinars, workshops, and roundtables hosted by NASIHA members — open to everyone.
      </p>
    </Reveal>
  );
}

// Matches the section's own layout shape so the swap-in doesn't shift
// layout — same rationale as CommunitiesSectionSkeleton.
export function EventsCalendarSectionSkeleton() {
  return (
    <section className="bg-background px-8 py-12 md:py-16">
      <div className="mx-auto max-w-[1120px]">
        <div className="mb-10 flex flex-col items-center gap-3">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-5 w-96 max-w-full" />
        </div>
        <Skeleton className="mx-auto aspect-square w-full max-w-[880px] rounded-xl sm:aspect-[5/2]" />
      </div>
    </section>
  );
}

/**
 * Homepage "Upcoming Events" section: every upcoming public event (the same set a
 * signed-out visitor sees on /events) as an auto-advancing carousel, earliest
 * first. A recurring series gets one slide, for its next occurrence —
 * otherwise a weekly event would fill the carousel with copies of itself.
 * Slides link to /events/[id], which forwards a signed-in member on to their
 * /calendar/[id] view.
 *
 * DB-backed, so behind its own <Suspense> in page.tsx, and falls back to an
 * empty list when the database isn't reachable (Docker's `next build`) — same
 * rationale as CommunitiesSection: the static homepage's ISR revalidation
 * fills it in with live data, and deploy-vps.sh warms that first request.
 */
export async function EventsCalendarSection() {
  const events = await getPublicUpcomingEvents().catch(() => []);
  const seenSeries = new Set<string>();
  const slides: EventSlide[] = [];
  for (const event of events) {
    if (seenSeries.has(event.seriesId)) continue;
    seenSeries.add(event.seriesId);
    slides.push({
      id: event.seriesId,
      title: event.title,
      description: event.description,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      imageUrl: event.heroImageUrl,
      href: `/events/${event.seriesId}`,
    });
  }

  // No upcoming events: no section at all, rather than a heading over an
  // empty-state line. (Also true for the build-time copy, which has no
  // database — ISR fills it in on the first real request; see above.)
  if (slides.length === 0) return null;

  return (
    <section className="bg-background px-8 py-12 md:py-16">
      <div className="mx-auto max-w-[1120px]">
        <SectionHeading />
        {/* Narrower than the section (1120px): at full width a 5:2 slide
            stood ~450px tall on desktop and dominated the page. */}
        <div className="mx-auto max-w-[880px]">
          <EventsCarousel slides={slides} />
        </div>
        <Reveal className="mt-10 text-center">
          <Button variant="outline" size="lg" asChild>
            <Link href="/events">See all events</Link>
          </Button>
        </Reveal>
      </div>
    </section>
  );
}
