import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";

/** "Add to calendar" (§4.6) — links straight to the .ics download route, no client state needed. */
export function AddToCalendarButton({ eventId }: { eventId: string }) {
  return (
    <Button size="sm" variant="outline" asChild>
      <a href={`/api/events/${eventId}/ics`} download>
        <CalendarPlus className="mr-1.5 h-4 w-4" />
        Add to calendar
      </a>
    </Button>
  );
}
