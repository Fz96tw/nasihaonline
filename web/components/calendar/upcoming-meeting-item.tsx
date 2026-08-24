import Link from "next/link";
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
 * no host/RSVP/attendee-count chrome). No detail page of its own: the topic
 * links to the underlying thread at /inbox?item=<id>, the same route the
 * Month grid's handleEventClick navigates to for meetings. Pending/
 * rescheduled requests (not yet accepted) get a "Proposed" badge and label
 * instead, since `meeting.scheduledAt` is only a proposed time for those,
 * not a confirmed one.
 */
export function UpcomingMeetingItem({ meeting }: { meeting: UpcomingMeeting }) {
  const hasMounted = useHasMounted();

  return (
    <li className="flex flex-col gap-3 border-b py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row">
        <Link
          href={`/inbox?item=${meeting.id}`}
          className="block aspect-video w-full overflow-hidden rounded-md bg-muted sm:aspect-auto sm:h-[9rem] sm:w-64 sm:flex-shrink-0"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- static asset, same rationale as EventListItem's heroImageUrl */}
          <img src="/images/1-on-1.jpg" alt="" className="h-full w-full object-cover" />
        </Link>
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Badge variant={meeting.isPending ? "warning" : "info"}>
              {meeting.isPending ? "Meeting request" : "Meeting"}
            </Badge>
          </div>
          <Link href={`/inbox?item=${meeting.id}`} className="block truncate font-medium hover:underline">
            {meeting.topic}
          </Link>
          <p className="text-sm text-muted-foreground">with {meeting.otherPartyName}</p>
          <p className="text-sm text-muted-foreground">
            {hasMounted
              ? `${meeting.isPending ? "Proposed: " : ""}${formatMeetingDateTime(meeting.scheduledAt)}`
              : null}
          </p>
        </div>
      </div>
      {(meeting.meetingUrl || meeting.livekitRoomName) && (
        <Button size="sm" variant="outline" className="flex-shrink-0" asChild>
          <Link href={`/meet/request/${meeting.id}`}>
            <Video className="mr-1.5 h-3.5 w-3.5" />
            Join meeting
          </Link>
        </Button>
      )}
    </li>
  );
}
