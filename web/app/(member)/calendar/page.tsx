import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getMemberUpcomingEvents } from "@/lib/events-server";
import { CalendarView } from "@/components/calendar/calendar-view";

export const metadata: Metadata = {
  title: "Calendar — Nasiha",
};

export default async function CalendarPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const events = await getMemberUpcomingEvents(user.id);

  return (
    <main className="mx-auto flex max-w-[1120px] flex-col gap-8 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Calendar</h1>
        <p className="text-muted-foreground">
          Upcoming webinars, workshops, and roundtables — including members-only sessions.
        </p>
      </div>

      <CalendarView events={events} />
    </main>
  );
}
