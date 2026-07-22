"use client";

import Link from "next/link";
import { RegisterButton } from "@/components/events/register-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EVENT_TYPE_LABELS, type PublicEvent } from "@/lib/events";
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

/**
 * /events/[eventId] — the public detail page, reached by a signed-out
 * visitor clicking through from the /events listing (open or members-only
 * event alike). The CTA branches on event.open: an open event needs no
 * account, so it's just RegisterButton with no membership nudge; a
 * members-only event can't be registered for (registerForEvent 400s on a
 * non-open event), so it gets "Join to RSVP" plus a "sign in" nudge for a
 * visitor who's already a member.
 */
export function PublicEventDetail({ event }: { event: PublicEvent }) {
  const hasMounted = useHasMounted();
  const isPast = hasMounted && new Date(event.endsAt ?? event.startsAt) < new Date();

  return (
    <div className="flex flex-col gap-6">
      {event.heroImageUrl && (
        <div className="flex h-72 w-full items-center justify-center overflow-hidden rounded-lg bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element -- MinIO-proxied URL, see Avatar's same rationale */}
          <img src={event.heroImageUrl} alt={event.title} className="h-full w-full object-contain" />
        </div>
      )}

      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Badge variant={event.open ? "success" : "info"}>{event.open ? "Open" : "Members Only"}</Badge>
          <Badge variant="neutral">{EVENT_TYPE_LABELS[event.type]}</Badge>
        </div>
        <h1 className="mb-1 text-3xl font-bold tracking-tight">{event.title}</h1>
        {event.hostName ? <p className="text-sm text-muted-foreground">Hosted by {event.hostName}</p> : null}
        <p className="text-sm text-muted-foreground">
          {hasMounted ? formatEventDateRange(event.startsAt, event.endsAt) : null}
        </p>
      </div>

      {isPast ? (
        <div className="rounded-lg border bg-muted px-4 py-3 text-sm text-muted-foreground">
          This event has already taken place.
        </div>
      ) : null}

      {event.description ? (
        <p className="whitespace-pre-line text-sm leading-relaxed">{event.description}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        {!isPast && event.open ? (
          <RegisterButton eventId={event.id} eventTitle={event.title} />
        ) : null}
        {!isPast && !event.open ? (
          <>
            <Button size="sm" asChild>
              <Link href="/join">Join to RSVP</Link>
            </Button>
            <Link href="/sign-in" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
              Already a member? Sign in to RSVP
            </Link>
          </>
        ) : null}
      </div>
    </div>
  );
}
