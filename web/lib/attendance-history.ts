// Client-safe types/merge logic for the dashboard's "Past Meetings" section —
// combines past community Events (getMemberEvents) with past 1:1
// MeetingRequests (getPastMeetingsForUser) into one shape so the widget can
// render, filter, and paginate them as a single list instead of two.
import type { EventType } from "@/lib/generated/prisma/enums";
import type { MemberEvent } from "@/lib/events";
import type { UpcomingMeeting } from "@/lib/meeting-requests";

export type AttendanceHistoryItem = {
  kind: "event" | "meeting";
  id: string;
  title: string;
  /** Present only for kind "event" — the specific EventType badge (Webinar, Workshop, ...). */
  eventType: EventType | null;
  startsAt: string;
  organizerName: string;
  hasRecording: boolean;
  recordingWatchHref: string | null;
  detailHref: string;
};

/** Detail-page link for a past occurrence — mirrors EventListItem's eventDetailHref. */
function eventDetailHref(event: MemberEvent): string {
  return event.isRecurring
    ? `/calendar/${event.seriesId}?occurrence=${encodeURIComponent(event.startsAt)}`
    : `/calendar/${event.seriesId}`;
}

/**
 * getMemberEvents returns both past and future occurrences (it deliberately
 * doesn't filter by startsAt — see its own comment); this widget only wants
 * this member's past attendance, so future ones are dropped here rather than
 * asking that shared query to grow a mode flag for one caller.
 */
export function buildAttendanceHistory(
  events: MemberEvent[],
  pastMeetings: UpcomingMeeting[],
  currentUserId: string,
): AttendanceHistoryItem[] {
  const nowIso = new Date().toISOString();

  const pastEventItems: AttendanceHistoryItem[] = events
    .filter((event) => event.startsAt < nowIso)
    .map((event) => ({
      kind: "event",
      id: event.id,
      title: event.title,
      eventType: event.type,
      startsAt: event.startsAt,
      organizerName: event.hostId === currentUserId ? "You" : event.hostName ?? "NASIHA Member",
      hasRecording: event.hasRecording,
      recordingWatchHref: event.recordingWatchHref,
      detailHref: eventDetailHref(event),
    }));

  const meetingItems: AttendanceHistoryItem[] = pastMeetings.map((meeting) => ({
    kind: "meeting",
    id: meeting.id,
    title: meeting.topic,
    eventType: null,
    startsAt: meeting.scheduledAt,
    organizerName: meeting.isOrganizer ? "You" : meeting.otherPartyName,
    hasRecording: meeting.hasRecording,
    recordingWatchHref: meeting.recordingWatchHref,
    detailHref: `/inbox?item=${meeting.id}`,
  }));

  return [...pastEventItems, ...meetingItems].sort((a, b) => b.startsAt.localeCompare(a.startsAt));
}
