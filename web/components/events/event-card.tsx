"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RsvpButton } from "@/components/calendar/rsvp-button";
import { EVENT_TYPE_LABELS, type EventWithRsvp } from "@/lib/events";

function formatEventDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// For a members-only event, the "Join to RSVP" CTA is driven by RSVP state
// once the visitor is actually signed in (§4.6) — same RsvpButton /calendar
// uses, just fed from getEventsForViewer's EventWithRsvp (no meetingUrl:
// that stays hidden on this public page even after RSVP'ing, per §4.6).
export function EventCard({ event, isSignedIn }: { event: EventWithRsvp; isSignedIn: boolean }) {
  const [rsvped, setRsvped] = useState(event.rsvped);

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <Badge variant={event.open ? "success" : "info"}>
            {event.open ? "Open" : "Members Only"}
          </Badge>
          <Badge variant="neutral">{EVENT_TYPE_LABELS[event.type]}</Badge>
        </div>
        <CardTitle className="text-xl">{event.title}</CardTitle>
        <p className="text-sm text-muted-foreground">{formatEventDate(event.startsAt)}</p>
        {event.hostName ? (
          <p className="text-sm text-muted-foreground">Hosted by {event.hostName}</p>
        ) : null}
      </CardHeader>
      {event.description ? (
        <CardContent className="pt-0 text-sm leading-relaxed text-muted-foreground">
          {event.description}
        </CardContent>
      ) : null}
      {!event.open ? (
        <CardFooter className="mt-auto pt-0">
          {isSignedIn ? (
            <RsvpButton eventId={event.id} rsvped={rsvped} onToggled={(result) => setRsvped(result.rsvped)} />
          ) : (
            <Button size="sm" asChild>
              <Link href="/join">Join to RSVP</Link>
            </Button>
          )}
        </CardFooter>
      ) : null}
    </Card>
  );
}
