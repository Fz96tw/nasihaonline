import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getMemberUpcomingEvents } from "@/lib/events-server";
import { EVENT_SUBMISSION_TIERS } from "@/lib/events";
import { CalendarView } from "@/components/calendar/calendar-view";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Calendar — Nasiha",
};

export default async function CalendarPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const events = await getMemberUpcomingEvents(user.id);
  const canSubmitEvent = Boolean(user.tier && EVENT_SUBMISSION_TIERS.includes(user.tier));

  return (
    <main className="mx-auto flex max-w-[1120px] flex-col gap-8 p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Calendar</h1>
          <p className="text-muted-foreground">
            Upcoming webinars, workshops, and roundtables — including members-only sessions.
          </p>
        </div>
        {canSubmitEvent && (
          <Button asChild>
            <Link href="/calendar/new">Submit Event</Link>
          </Button>
        )}
      </div>

      <CalendarView events={events} />
    </main>
  );
}
