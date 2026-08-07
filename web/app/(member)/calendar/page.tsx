import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getMemberEvents } from "@/lib/events-server";
import { EVENT_SUBMISSION_TIERS } from "@/lib/events";
import { getUpcomingMeetingsForUser } from "@/lib/meeting-requests-server";
import { CalendarView } from "@/components/calendar/calendar-view";
import { BackToFeedLink } from "@/components/feed/back-to-feed-link";
import { isFromFeed } from "@/lib/feed";
import { Button } from "@/components/ui/button";
import { ParallaxHeroImage } from "@/components/home/parallax-hero-image";

export const metadata: Metadata = {
  title: "Calendar — NASIHA",
};

export default async function CalendarPage({ searchParams }: { searchParams: { ref?: string; mine?: string } }) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const [allEvents, meetings] = await Promise.all([
    getMemberEvents(user.id),
    getUpcomingMeetingsForUser(user.id),
  ]);
  const canSubmitEvent = Boolean(user.tier && EVENT_SUBMISSION_TIERS.includes(user.tier));
  const mine = searchParams.mine === "1";
  const events = mine ? allEvents.filter((event) => event.hostId === user.id) : allEvents;

  const mineHref = (() => {
    const qs = new URLSearchParams();
    if (searchParams.ref) qs.set("ref", searchParams.ref);
    if (!mine) qs.set("mine", "1");
    const query = qs.toString();
    return `/calendar${query ? `?${query}` : ""}`;
  })();

  return (
    <main className="min-h-screen">
      <section className="relative overflow-hidden px-8 py-16 text-center text-primary-foreground">
        <ParallaxHeroImage src="/images/calendar.jpg" priority />
        <div className="absolute inset-0 -z-10 bg-[rgba(10,20,70,.4)]" />
        <div className="relative mx-auto max-w-[580px]">
          <h1 className="mb-3 text-[2.5rem] font-extrabold leading-[1.1] tracking-[-.02em] [text-shadow:0_2px_16px_rgba(0,10,40,.55)] md:text-[3.5rem]">Calendar</h1>
          <p className="text-xl leading-[1.6] opacity-[.88] [text-shadow:0_1px_10px_rgba(0,10,40,.6)] md:text-2xl">
            Upcoming webinars, workshops, and roundtables — including members-only sessions.
          </p>
        </div>
      </section>

      <section className="mx-auto flex max-w-[1120px] flex-col gap-8 px-8 py-16">
        <BackToFeedLink searchParams={searchParams} />

        <div className="flex justify-end gap-2">
          <Button asChild variant={mine ? "secondary" : "outline"}>
            <Link href={mineHref} scroll={false}>
              My Events
            </Link>
          </Button>
          {canSubmitEvent && (
            <Button asChild>
              <Link href="/calendar/new">Submit Event</Link>
            </Button>
          )}
        </div>

        <CalendarView
          events={events}
          meetings={meetings}
          currentUserId={user.id}
          forcedTab={isFromFeed(searchParams) ? "list" : undefined}
        />
      </section>
    </main>
  );
}
