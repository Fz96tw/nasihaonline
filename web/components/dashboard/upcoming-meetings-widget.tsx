import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getUpcomingMeetingsForUser } from "@/lib/meeting-requests-server";

const DASHBOARD_MEETING_LIMIT = 5;

function formatMeetingDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * A member's own 1-on-1 meeting requests — scheduled (accepted) or still
 * awaiting a response either way — distinct from UpcomingEventsWidget's
 * community Events. Reuses getUpcomingMeetingsForUser (also powers the
 * calendar page's Upcoming List) rather than a second query, then trims to
 * DASHBOARD_MEETING_LIMIT for the dashboard card.
 */
export async function UpcomingMeetingsWidget({ userId }: { userId: string }) {
  const meetings = await getUpcomingMeetingsForUser(userId);
  const shown = meetings.slice(0, DASHBOARD_MEETING_LIMIT);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">1-on-1 Meetings</CardTitle>
      </CardHeader>
      <CardContent>
        {shown.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No meetings scheduled or pending right now.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {shown.map((meeting) => (
              <li key={meeting.id} className="border-b pb-3 last:border-b-0 last:pb-0">
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={`/inbox?item=${meeting.id}`}
                    className="min-w-0 truncate text-sm font-medium hover:underline"
                  >
                    {meeting.topic}
                  </Link>
                  <Badge variant={meeting.isPending ? "warning" : "info"} className="flex-shrink-0">
                    {meeting.isPending ? "Meeting request" : "Meeting"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {meeting.isPending ? "Proposed: " : ""}
                  {formatMeetingDateTime(meeting.scheduledAt)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Organizer: {meeting.isOrganizer ? "You" : meeting.otherPartyName} · with{" "}
                  {meeting.isOrganizer ? meeting.otherPartyName : "you"}
                </p>
              </li>
            ))}
          </ul>
        )}
        <Link
          href="/calendar"
          className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
        >
          View calendar
        </Link>
      </CardContent>
    </Card>
  );
}
