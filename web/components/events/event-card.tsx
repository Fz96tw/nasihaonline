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

// Wraps the card's image/header/description in a Link when `href` is set,
// otherwise renders them unwrapped. Kept out of CardFooter's DOM subtree so
// its own interactive control (RsvpButton/RegisterButton/"Join to RSVP")
// never ends up nested inside this anchor.
function CardLinkWrapper({ href, children }: { href: string | null; children: React.ReactNode }) {
  if (!href) return <>{children}</>;
  return (
    <Link href={href} className="flex flex-1 flex-col">
      {children}
    </Link>
  );
}

// The footer CTA branches three ways (§4.6): a members-only event drives
// "Join to RSVP" (signed out) or the RsvpButton /calendar also uses (signed
// in); an open event lets a signed-in member RSVP the same way, but a
// signed-out visitor instead gets the anonymous RegisterButton (no
// meetingUrl either way — that stays hidden on this public page per §4.6).
export function EventCard({ event, isSignedIn }: { event: EventWithRsvp; isSignedIn: boolean }) {
  const [rsvped, setRsvped] = useState(event.rsvped);
  const hasMounted = useHasMounted();
  // A signed-out visitor gets a public detail page to click through to
  // (§4.6's /events/[eventId]) for any event, open or members-only — a
  // signed-in member already has the fuller /calendar/[eventId] view, so
  // this card itself stays non-interactive above its RSVP CTA for them.
  const detailHref = !isSignedIn ? `/events/${event.id}` : null;

  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <CardLinkWrapper href={detailHref}>
        {event.heroImageUrl ? (
          <div className="relative h-40 w-full shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element -- MinIO-proxied URL, see Avatar's same rationale */}
            <img src={event.heroImageUrl} alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-[rgba(10,20,70,.4)]" />
          </div>
        ) : null}
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
      </CardLinkWrapper>
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
