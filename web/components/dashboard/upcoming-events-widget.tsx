import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getDashboardUpcomingEvents } from "@/lib/events-server";

function formatEventDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Live upcoming events from the Event/RSVP models, replacing the zero-state
// placeholder now that 4.1/4.3/4.4 have landed (PRD §10 Phase 4 capstone).
export async function UpcomingEventsWidget({ userId }: { userId: string }) {
  const events = await getDashboardUpcomingEvents(userId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Upcoming events</CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No upcoming events right now. Check the calendar for what&apos;s coming up.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {events.map((event) => (
              <li
                key={event.id}
                className="flex items-center justify-between gap-2 border-b pb-3 last:border-b-0 last:pb-0"
              >
                <div className="min-w-0">
                  <Link href={`/calendar/${event.id}`} className="block truncate text-sm font-medium hover:underline">
                    {event.title}
                  </Link>
                  <p className="text-xs text-muted-foreground">{formatEventDateTime(event.startsAt)}</p>
                </div>
                {event.rsvped ? <Badge variant="success">Going</Badge> : null}
              </li>
            ))}
          </ul>
        )}
        <Link
          href="/calendar"
          className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
        >
          View calendar
        </Link>
      </CardContent>
    </Card>
  );
}
