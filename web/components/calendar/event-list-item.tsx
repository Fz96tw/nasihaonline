"use client";

import Link from "next/link";
import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { RsvpButton } from "@/components/calendar/rsvp-button";
import { AddToCalendarButton } from "@/components/calendar/add-to-calendar-button";
import { EVENT_TYPE_LABELS, getEventAudienceBadge, type MemberEvent } from "@/lib/events";
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

/** Detail-page link for one occurrence — targets the real series id, carrying `?occurrence=` for a recurring event so the page resolves to this specific session. */
function eventDetailHref(event: MemberEvent): string {
  return event.isRecurring
    ? `/calendar/${event.seriesId}?occurrence=${encodeURIComponent(event.startsAt)}`
    : `/calendar/${event.seriesId}`;
}

// RSVP/meetingUrl are controlled by the parent CalendarView (not local
// state here) so they survive the "Upcoming List" tab panel being
// unmounted and remounted when the user switches to Month and back.
export function EventListItem({
  event,
  isHost,
  onRsvpToggled,
}: {
  event: MemberEvent;
  /** True when this viewer hosts the event — hides the RSVP button (a host never RSVPs to their own event) and shows the join link regardless of RSVP status. */
  isHost: boolean;
  onRsvpToggled: (result: { rsvped: boolean; meetingUrl: string | null; attendeeCount?: number }) => void;
}) {
  const { rsvped, meetingUrl, attendeeCount } = event;
  const hasMounted = useHasMounted();
  const audienceBadge = getEventAudienceBadge(event);

  return (
    <li className="flex flex-col gap-3 border-b py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row">
        {event.heroImageUrl ? (
          <Link
            href={eventDetailHref(event)}
            className="block aspect-video w-full overflow-hidden rounded-md bg-muted sm:aspect-auto sm:h-[9rem] sm:w-64 sm:flex-shrink-0"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- MinIO-proxied URL, see Avatar's same rationale */}
            <img src={event.heroImageUrl} alt="" className="h-full w-full object-cover" />
          </Link>
        ) : null}
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Badge variant={audienceBadge.variant}>{audienceBadge.label}</Badge>
            <Badge variant="neutral">{EVENT_TYPE_LABELS[event.type]}</Badge>
            {event.isRecurring && event.recurrenceSummary ? (
              <Badge variant="neutral" title={event.recurrenceSummary}>
                Repeats
              </Badge>
            ) : null}
            <span className="flex items-center gap-1 text-xs text-muted-foreground" title="Registered or RSVP'd">
              <Users className="h-3.5 w-3.5" />
              {attendeeCount}
            </span>
          </div>
          <Link href={eventDetailHref(event)} className="block truncate font-medium hover:underline">
            {event.title}
          </Link>
          {event.hostName ? (
            <p className="text-sm text-muted-foreground">Hosted by {event.hostName}</p>
          ) : null}
          <p className="text-sm text-muted-foreground">
            {hasMounted ? formatEventDateTime(event.startsAt) : null}
          </p>
          {(rsvped || isHost) && meetingUrl ? (
            <Link
              href={`/meet/event/${event.seriesId}`}
              className="mt-1 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Join session link
            </Link>
          ) : null}
        </div>
      </div>
      <div className="flex flex-shrink-0 flex-col items-start gap-2 sm:items-end">
        {!isHost && <RsvpButton eventId={event.seriesId} rsvped={rsvped} onToggled={onRsvpToggled} />}
        <AddToCalendarButton eventId={event.seriesId} occurrenceIso={event.isRecurring ? event.startsAt : undefined} />
      </div>
    </li>
  );
}
