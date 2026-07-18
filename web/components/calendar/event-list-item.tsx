"use client";

import { Badge } from "@/components/ui/badge";
import { RsvpButton } from "@/components/calendar/rsvp-button";
import { AddToCalendarButton } from "@/components/calendar/add-to-calendar-button";
import { EVENT_TYPE_LABELS, type MemberEvent } from "@/lib/events";
import { useHasMounted } from "@/lib/use-has-mounted";

function formatEventDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// RSVP/meetingUrl are controlled by the parent CalendarView (not local
// state here) so they survive the "Upcoming List" tab panel being
// unmounted and remounted when the user switches to Month and back.
export function EventListItem({
  event,
  onRsvpToggled,
}: {
  event: MemberEvent;
  onRsvpToggled: (result: { rsvped: boolean; meetingUrl: string | null }) => void;
}) {
  const { rsvped, meetingUrl } = event;
  const hasMounted = useHasMounted();

  return (
    <li className="flex flex-col gap-3 border-b py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <Badge variant={event.open ? "success" : "info"}>
            {event.open ? "Open" : "Members Only"}
          </Badge>
          <Badge variant="neutral">{EVENT_TYPE_LABELS[event.type]}</Badge>
        </div>
        <p className="truncate font-medium">{event.title}</p>
        {event.hostName ? (
          <p className="text-sm text-muted-foreground">Hosted by {event.hostName}</p>
        ) : null}
        <p className="text-sm text-muted-foreground">
          {hasMounted ? formatEventDateTime(event.startsAt) : null}
        </p>
        {rsvped && meetingUrl ? (
          <a
            href={meetingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Join session link
          </a>
        ) : null}
      </div>
      <div className="flex flex-shrink-0 flex-col items-start gap-2 sm:items-end">
        <RsvpButton eventId={event.id} rsvped={rsvped} onToggled={onRsvpToggled} />
        <AddToCalendarButton eventId={event.id} />
      </div>
    </li>
  );
}
