import { Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type UpcomingMeeting } from "@/lib/meeting-requests";
import { useHasMounted } from "@/lib/use-has-mounted";

function formatMeetingDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

/**
 * A private 1:1 meeting row in the calendar's "Upcoming List" — visually
 * distinct from EventListItem's community events (a plain "Meeting" badge,
 * no host/RSVP/attendee-count chrome, no detail page link since meeting
 * requests are managed from /inbox, not /calendar).
 */
export function UpcomingMeetingItem({ meeting }: { meeting: UpcomingMeeting }) {
  const hasMounted = useHasMounted();

  return (
    <li className="flex flex-col gap-3 border-b py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <Badge variant="info">Meeting</Badge>
        </div>
        <p className="truncate font-medium">{meeting.topic}</p>
        <p className="text-sm text-muted-foreground">with {meeting.otherPartyName}</p>
        <p className="text-sm text-muted-foreground">
          {hasMounted ? formatMeetingDateTime(meeting.scheduledAt) : null}
        </p>
      </div>
      {meeting.meetingUrl && (
        <Button size="sm" variant="outline" className="flex-shrink-0" asChild>
          <a href={meeting.meetingUrl} target="_blank" rel="noopener noreferrer">
            <Video className="mr-1.5 h-3.5 w-3.5" />
            Join Google Meet
          </a>
        </Button>
      )}
    </li>
  );
}
