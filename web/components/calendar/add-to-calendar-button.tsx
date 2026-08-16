import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * "Add to calendar" (§4.6) — links straight to the .ics download route, no
 * client state needed. `occurrenceIso`, when set (a recurring event's
 * specific session), is passed through as ?occurrence= so the downloaded
 * .ics's DTSTART/DTEND reflect that session while still carrying the whole
 * series' RRULE.
 */
export function AddToCalendarButton({ eventId, occurrenceIso }: { eventId: string; occurrenceIso?: string }) {
  const href = occurrenceIso
    ? `/api/events/${eventId}/ics?occurrence=${encodeURIComponent(occurrenceIso)}`
    : `/api/events/${eventId}/ics`;
  return (
    <Button size="sm" variant="outline" asChild>
      <a href={href} download>
        <CalendarPlus className="mr-1.5 h-4 w-4" />
        REMINDER
      </a>
    </Button>
  );
}
