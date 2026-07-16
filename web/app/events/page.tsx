import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth";
import { getEventsForViewer } from "@/lib/events-server";
import { EventCard } from "@/components/events/event-card";

export const metadata: Metadata = {
  title: "Events — NASIHA",
};

export default async function EventsPage() {
  const user = await getSessionUser();
  const events = await getEventsForViewer(user?.id ?? null);
  const isSignedIn = Boolean(user);

  return (
    <main className="min-h-screen">
      <section
        className="relative overflow-hidden bg-cover bg-center px-8 py-16 text-center text-primary-foreground"
        style={{ backgroundImage: "url(/images/brick-texture.jpg)" }}
      >
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(10,20,60,.75),rgba(10,20,80,.6))]" />
        <div className="relative mx-auto max-w-[580px]">
          <h1 className="mb-3 text-[2.4rem] font-extrabold tracking-[-.02em]">Events</h1>
          <p className="text-base leading-[1.7] opacity-[.88]">
            Upcoming webinars, workshops, and roundtables from the NASIHA community.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-[1120px] px-8 py-16">
        {events.length === 0 ? (
          <p className="text-center text-muted-foreground">No upcoming events right now — check back soon.</p>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((event) => (
              <EventCard key={event.id} event={event} isSignedIn={isSignedIn} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
