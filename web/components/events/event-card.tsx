"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RsvpButton } from "@/components/calendar/rsvp-button";
import { RegisterButton } from "@/components/events/register-button";
import { EVENT_TYPE_LABELS, type EventWithRsvp } from "@/lib/events";
import { useHasMounted } from "@/lib/use-has-mounted";

function formatEventDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// The footer CTA branches three ways (§4.6): a members-only event drives
// "Join to RSVP" (signed out) or the RsvpButton /calendar also uses (signed
// in); an open event lets a signed-in member RSVP the same way, but a
// signed-out visitor instead gets the anonymous RegisterButton (no
// meetingUrl either way — that stays hidden on this public page per §4.6).
export function EventCard({ event, isSignedIn }: { event: EventWithRsvp; isSignedIn: boolean }) {
  const [rsvped, setRsvped] = useState(event.rsvped);
  const hasMounted = useHasMounted();

  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <Badge variant={event.open ? "success" : "info"}>
            {event.open ? "Open" : "Members Only"}
          </Badge>
          <Badge variant="neutral">{EVENT_TYPE_LABELS[event.type]}</Badge>
        </div>
        <CardTitle className="text-xl">{event.title}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {hasMounted ? formatEventDate(event.startsAt) : null}
        </p>
        {event.hostName ? (
          <p className="text-sm text-muted-foreground">Hosted by {event.hostName}</p>
        ) : null}
      </CardHeader>
      {event.description ? (
        <CardContent className="pt-0 text-sm leading-relaxed text-muted-foreground">
          {event.description}
        </CardContent>
      ) : null}
      <CardFooter className="mt-auto pt-0">
        {isSignedIn ? (
          <RsvpButton eventId={event.id} rsvped={rsvped} onToggled={(result) => setRsvped(result.rsvped)} />
        ) : event.open ? (
          <RegisterButton eventId={event.id} eventTitle={event.title} />
        ) : (
          <Button size="sm" asChild>
            <Link href="/join">Join to RSVP</Link>
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
