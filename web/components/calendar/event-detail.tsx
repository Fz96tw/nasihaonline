"use client";

import { useState } from "react";
import Link from "next/link";
import { MessageSquare, Pencil, Users } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RsvpButton } from "@/components/calendar/rsvp-button";
import { AddToCalendarButton } from "@/components/calendar/add-to-calendar-button";
import { EventViewCounter } from "@/components/calendar/event-view-counter";
import {
  EVENT_TYPE_LABELS,
  type EventRegistrationAttendee,
  type EventRsvpAttendee,
  type MemberEvent,
} from "@/lib/events";
import { EVENTS_FORUM_SLUG } from "@/lib/forums";
import type { DirectoryMember } from "@/lib/members";
import { useHasMounted } from "@/lib/use-has-mounted";

function formatEventDateRange(startsAt: string, endsAt: string | null) {
  const start = new Date(startsAt);
  const startLabel = start.toLocaleString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  if (!endsAt) return startLabel;

  const end = new Date(endsAt);
  const sameDay = start.toDateString() === end.toDateString();
  const endLabel = end.toLocaleString(undefined, sameDay ? { hour: "numeric", minute: "2-digit" } : {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${startLabel} – ${endLabel}`;
}

/** /calendar/[eventId] (§4.6) — single-event detail: full description, host, RSVP, and add-to-calendar. */
export function EventDetail({
  event: initialEvent,
  canEdit,
  attendees,
  hostProfile,
}: {
  event: MemberEvent;
  canEdit: boolean;
  attendees: { rsvps: EventRsvpAttendee[]; registrations: EventRegistrationAttendee[] } | null;
  /** Host's Directory profile, if they're directory-listed and tier-eligible (§4.3/§9) — null otherwise, in which case the avatar shows initials only and isn't clickable. */
  hostProfile: DirectoryMember | null;
}) {
  const [event, setEvent] = useState(initialEvent);
  const hasMounted = useHasMounted();
  const isPast = hasMounted && new Date(event.endsAt ?? event.startsAt) < new Date();
  const hostName = event.hostName ?? "NASIHA Member";

  function handleRsvpToggled(result: { rsvped: boolean; meetingUrl: string | null; attendeeCount?: number }) {
    setEvent((prev) => ({ ...prev, ...result }));
  }

  return (
    <div className="flex flex-col gap-6">
      {event.heroImageUrl && (
        <div className="flex h-72 w-full items-center justify-center overflow-hidden rounded-lg bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element -- MinIO-proxied URL, see Avatar's same rationale */}
          <img
            src={event.heroImageUrl}
            alt={event.title}
            className="h-full w-full object-contain"
          />
        </div>
      )}

      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Badge variant={event.open ? "success" : "info"}>{event.open ? "Open" : "Members Only"}</Badge>
          <Badge variant="neutral">{EVENT_TYPE_LABELS[event.type]}</Badge>
          <span className="flex items-center gap-1 text-xs text-muted-foreground" title="Registered or RSVP'd">
            <Users className="h-3.5 w-3.5" />
            {event.attendeeCount}
          </span>
          <EventViewCounter eventId={event.id} initialViews={event.viewCount} />
        </div>
        <h1 className="mb-1 text-3xl font-bold tracking-tight">{event.title}</h1>
        {hostProfile ? (
          <Link
            href={`/members/${hostProfile.id}`}
            aria-label={`View ${hostName}'s profile`}
            className="flex items-center gap-3 text-left"
          >
            <Avatar name={hostName} src={hostProfile.avatarUrl} size="md" />
            <div>
              {event.hostName ? <p className="text-sm text-muted-foreground">Hosted by {event.hostName}</p> : null}
              <p className="text-sm text-muted-foreground">
                {hasMounted ? formatEventDateRange(event.startsAt, event.endsAt) : null}
              </p>
            </div>
          </Link>
        ) : (
          <div className="flex items-center gap-3">
            <Avatar name={hostName} size="md" />
            <div>
              {event.hostName ? <p className="text-sm text-muted-foreground">Hosted by {event.hostName}</p> : null}
              <p className="text-sm text-muted-foreground">
                {hasMounted ? formatEventDateRange(event.startsAt, event.endsAt) : null}
              </p>
            </div>
          </div>
        )}
      </div>

      {isPast ? (
        <div className="rounded-lg border bg-muted px-4 py-3 text-sm text-muted-foreground">
          This event has already taken place.
        </div>
      ) : null}

      {event.description ? (
        <p className="whitespace-pre-line text-sm leading-relaxed">{event.description}</p>
      ) : null}

      {event.rsvped && event.meetingUrl ? (
        <a
          href={event.meetingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="w-fit text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Join session link
        </a>
      ) : null}

      {event.forumThreadId ? (
        <Link
          href={`/forums/${EVENTS_FORUM_SLUG}/${event.forumThreadId}`}
          className="flex w-fit items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          <MessageSquare className="h-4 w-4" />
          Discuss this event
          {event.forumReplyCount ? ` (${event.forumReplyCount})` : ""}
        </Link>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        {!isPast && <RsvpButton eventId={event.id} rsvped={event.rsvped} onToggled={handleRsvpToggled} />}
        {!isPast && <AddToCalendarButton eventId={event.id} />}
        {canEdit && (
          <Button size="sm" variant="outline" asChild>
            <Link href={`/calendar/${event.id}/edit`}>
              <Pencil className="mr-1.5 h-4 w-4" />
              Edit Event
            </Link>
          </Button>
        )}
      </div>

      {canEdit && attendees ? (
        <div className="flex flex-col gap-4 border-t pt-6">
          <div>
            <h2 className="mb-2 text-sm font-semibold">RSVP&apos;d members ({attendees.rsvps.length})</h2>
            {attendees.rsvps.length === 0 ? (
              <p className="text-sm text-muted-foreground">No RSVPs yet.</p>
            ) : (
              <ul className="text-sm text-muted-foreground">
                {attendees.rsvps.map((rsvp) => (
                  <li key={rsvp.id}>{rsvp.name ?? "A member"}</li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h2 className="mb-2 text-sm font-semibold">Registered guests ({attendees.registrations.length})</h2>
            {attendees.registrations.length === 0 ? (
              <p className="text-sm text-muted-foreground">No registrations yet.</p>
            ) : (
              <ul className="text-sm text-muted-foreground">
                {attendees.registrations.map((registration) => (
                  <li key={registration.id}>
                    {registration.name ?? "Guest"} — {registration.email}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
