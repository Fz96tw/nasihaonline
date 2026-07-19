import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth";
import { getEventsForViewer } from "@/lib/events-server";
import { EventCard } from "@/components/events/event-card";
import { ParallaxHeroImage } from "@/components/home/parallax-hero-image";
import { Reveal } from "@/components/home/reveal";

export const metadata: Metadata = {
  title: "Events — NASIHA",
};

export default async function EventsPage() {
  const user = await getSessionUser();
  const events = await getEventsForViewer(user?.id ?? null);
  const isSignedIn = Boolean(user);

  return (
    <main className="min-h-screen">
      <section className="relative overflow-hidden px-8 py-16 text-center text-primary-foreground">
        <ParallaxHeroImage src="/images/events.jpg" priority />
        <div className="absolute inset-0 -z-10 bg-[rgba(10,20,70,.4)]" />
        <div className="relative mx-auto max-w-[580px]">
          <h1 className="mb-3 text-[2.5rem] font-extrabold leading-[1.1] tracking-[-.02em] [text-shadow:0_2px_16px_rgba(0,10,40,.55)] md:text-[3.5rem]">Events</h1>
          <p className="text-xl leading-[1.6] opacity-[.88] [text-shadow:0_1px_10px_rgba(0,10,40,.6)] md:text-2xl">
            Upcoming webinars, workshops, and roundtables from the NASIHA community.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-[1120px] px-8 py-16">
        {events.length === 0 ? (
          <p className="text-center text-muted-foreground">No upcoming events right now — check back soon.</p>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((event, index) => (
              <Reveal key={event.id} index={index} hover className="h-full">
                <EventCard event={event} isSignedIn={isSignedIn} />
              </Reveal>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
