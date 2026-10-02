"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { useReminderSessions } from "@/hooks/use-reminder-sessions";
import { publicReminderStateOf, type PublicReminderState } from "@/lib/session-reminders";

const TICK_MS = 15_000;

const LABELS: Record<PublicReminderState, string> = {
  soon: "Starting soon",
  waiting: "Waiting for host",
  started: "Live now",
};

/**
 * "Starting soon" / "Waiting for host" / "Live now" badge for a public event,
 * from the same shared polling query as the popup and the live-events strip.
 * A listing card passes its `occurrenceId` so only THAT occurrence of a
 * recurring series is badged (a future occurrence's card must not read "Live
 * now" because an earlier one is running); the series detail page passes just
 * the `eventId` and matches whichever occurrence is currently in the window.
 * Renders nothing when the event isn't inside that window, so it can be
 * dropped into any badge row unconditionally.
 */
export function LiveEventBadge({ eventId, occurrenceId }: { eventId: string; occurrenceId?: string }) {
  const { data: sessions } = useReminderSessions("/api/public-session-reminders");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const state = (sessions ?? [])
    .filter((session) =>
      occurrenceId ? session.key === `public-event-${occurrenceId}` : session.eventId === eventId,
    )
    .map((session) => publicReminderStateOf(session, now))
    .find((s): s is PublicReminderState => s !== null);
  if (!state) return null;

  return <Badge variant={state === "started" ? "success" : "warning"}>{LABELS[state]}</Badge>;
}
