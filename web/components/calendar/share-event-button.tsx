"use client";

import { ShareButton } from "@/components/shared/share-button";

function formatShareDate(startsAt: string) {
  return new Date(startsAt).toLocaleString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

/**
 * Share on the member event detail page — always the public
 * /events/[eventId] URL, never the member-only /calendar/[eventId] one a
 * member would otherwise copy from their address bar (that redirects a
 * signed-out recipient to /sign-in). Only rendered when the event is
 * publicly visible (isEventPubliclyVisible).
 */
export function ShareEventButton({ eventId, title, startsAt }: { eventId: string; title: string; startsAt: string }) {
  const when = formatShareDate(startsAt);
  return (
    <ShareButton
      path={`/events/${eventId}`}
      title={title}
      emailSubject={`${title} — ${when}`}
      emailIntro={`Thought you might be interested in this NASIHA event: ${title}, ${when}.\n\nDetails and registration:`}
    />
  );
}
