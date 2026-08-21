import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDashboardUpcomingEvents } from "@/lib/events-server";
import { getUpcomingMeetingsForUser } from "@/lib/meeting-requests-server";
import { ScheduleAgenda, type ScheduleItem } from "@/components/dashboard/schedule-agenda";

const SCHEDULE_LIMIT = 6;

/**
 * Merges community Events (RSVP'd/open) and 1-on-1 Meetings into one
 * date-grouped agenda so members see everything on their calendar in one
 * place instead of two near-identical widgets.
 */
export async function ScheduleWidget({ userId }: { userId: string }) {
  const [events, meetings] = await Promise.all([
    getDashboardUpcomingEvents(userId),
    getUpcomingMeetingsForUser(userId),
  ]);

  const items: ScheduleItem[] = [
    ...events.map((event) => ({
      id: `event-${event.id}`,
      title: event.title,
      dateTime: event.startsAt,
      href: event.isRecurring
        ? `/calendar/${event.seriesId}?occurrence=${encodeURIComponent(event.startsAt)}`
        : `/calendar/${event.seriesId}`,
      badge: event.rsvped ? ({ label: "Going", variant: "success" } as const) : null,
      joinUrl: event.meetingUrl ? `/meet/event/${event.seriesId}` : null,
      joinLabel: "Join the session",
    })),
    ...meetings.map((meeting) => ({
      id: `meeting-${meeting.id}`,
      title: meeting.topic,
      dateTime: meeting.scheduledAt,
      href: `/inbox?item=${meeting.id}`,
      detail: `${meeting.isOrganizer ? "You" : meeting.otherPartyName} · with ${
        meeting.isOrganizer ? meeting.otherPartyName : "you"
      }`,
      badge: meeting.isPending
        ? ({ label: "Meeting request", variant: "warning" } as const)
        : ({ label: "Meeting", variant: "info" } as const),
      joinUrl: meeting.meetingUrl ? `/meet/request/${meeting.id}` : null,
      joinLabel: "Join the meeting",
    })),
  ]
    .sort((a, b) => a.dateTime.localeCompare(b.dateTime))
    .slice(0, SCHEDULE_LIMIT);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Your Schedule</CardTitle>
      </CardHeader>
      <CardContent>
        <ScheduleAgenda items={items} />
        <Link href="/calendar" className="mt-4 inline-block text-sm font-medium text-primary hover:underline">
          View calendar
        </Link>
      </CardContent>
    </Card>
  );
}
