import "server-only";
import { db } from "@/lib/db";
import { RecordingOrigin } from "@/lib/generated/prisma/enums";

export type AdminRecordingSegment = {
  id: string;
  /** "Part 1", "Part 2", ... — positional within its group, always numbered even when there's only one (matches the Event/MeetingRequest detail pages' own convention). */
  label: string;
  status: "ready" | "processing" | "failed";
  /** Pre-formatted "42 min · Aug 20, 3:00 PM", or null when startedAt is unknown. */
  meta: string | null;
  watchHref: string | null;
  downloadHref: string | null;
};

export type AdminRecordingGroup = {
  kind: "event" | "meeting";
  /** React key — includes occurrenceDate for events, since a recurring series' recordings must stay split by occurrence, not merged into one group. */
  key: string;
  title: string;
  organizerName: string;
  occurredAt: string | null;
  segments: AdminRecordingSegment[];
};

function segmentStatus(recording: { objectKey: string | null; failedAt: Date | null }): "ready" | "processing" | "failed" {
  if (recording.objectKey) return "ready";
  if (recording.failedAt) return "failed";
  return "processing";
}

function formatMeta(durationSeconds: number | null, startedAt: Date | null): string | null {
  if (!startedAt) return null;
  const dateLabel = startedAt.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  if (!durationSeconds) return dateLabel;
  return `${Math.round(durationSeconds / 60)} min · ${dateLabel}`;
}

/**
 * Every LiveKit recording system-wide, for the admin oversight page
 * (objective c602a120) — unlike the member-facing queries, this isn't
 * scoped to one viewer's own attendance/hosting. MeetingRequestRecording
 * has no `origin` column (it's inherently LiveKit-only — a Meet-origin 1:1
 * recording lives on MeetingRequest.recordingUrl directly, never in this
 * table), so only EventRecording needs an explicit origin filter.
 */
export async function getAllRecordingsForAdmin(): Promise<AdminRecordingGroup[]> {
  const [eventRecordings, meetingRecordings] = await Promise.all([
    db.eventRecording.findMany({
      where: { origin: RecordingOrigin.livekit },
      select: {
        id: true,
        eventId: true,
        occurrenceDate: true,
        objectKey: true,
        failedAt: true,
        startedAt: true,
        durationSeconds: true,
        event: { select: { title: true, host: { select: { name: true } } } },
      },
      orderBy: { startedAt: "asc" },
    }),
    db.meetingRequestRecording.findMany({
      select: {
        id: true,
        meetingRequestId: true,
        objectKey: true,
        failedAt: true,
        startedAt: true,
        durationSeconds: true,
        meetingRequest: {
          select: {
            topic: true,
            scheduledAt: true,
            sender: { select: { name: true } },
            recipient: { select: { name: true } },
          },
        },
      },
      orderBy: { startedAt: "asc" },
    }),
  ]);

  const eventGroups = new Map<string, AdminRecordingGroup>();
  for (const recording of eventRecordings) {
    // Groups by (eventId, occurrenceDate), not just eventId — a recurring
    // event's own weekly recordings must stay split by occurrence rather
    // than all numbering as "Part 1, 2, 3..." of one merged series.
    const key = `event:${recording.eventId}:${recording.occurrenceDate.toISOString()}`;
    const group = eventGroups.get(key) ?? {
      kind: "event" as const,
      key,
      title: recording.event.title,
      organizerName: recording.event.host.name ?? "NASIHA Member",
      occurredAt: recording.occurrenceDate.toISOString(),
      segments: [],
    };
    group.segments.push({
      id: recording.id,
      label: `Part ${group.segments.length + 1}`,
      status: segmentStatus(recording),
      meta: formatMeta(recording.durationSeconds, recording.startedAt),
      watchHref: recording.objectKey ? `/api/events/${recording.eventId}/recording/${recording.id}` : null,
      downloadHref: recording.objectKey ? `/api/events/${recording.eventId}/recording/${recording.id}?download=1` : null,
    });
    eventGroups.set(key, group);
  }

  const meetingGroups = new Map<string, AdminRecordingGroup>();
  for (const recording of meetingRecordings) {
    const key = `meeting:${recording.meetingRequestId}`;
    const senderName = recording.meetingRequest.sender.name ?? "NASIHA Member";
    const recipientName = recording.meetingRequest.recipient.name ?? "NASIHA Member";
    const group = meetingGroups.get(key) ?? {
      kind: "meeting" as const,
      key,
      title: recording.meetingRequest.topic,
      organizerName: `${senderName} ↔ ${recipientName}`,
      occurredAt: recording.meetingRequest.scheduledAt?.toISOString() ?? null,
      segments: [],
    };
    group.segments.push({
      id: recording.id,
      label: `Part ${group.segments.length + 1}`,
      status: segmentStatus(recording),
      meta: formatMeta(recording.durationSeconds, recording.startedAt),
      watchHref: recording.objectKey
        ? `/api/inbox/meeting-requests/${recording.meetingRequestId}/recording/${recording.id}`
        : null,
      downloadHref: recording.objectKey
        ? `/api/inbox/meeting-requests/${recording.meetingRequestId}/recording/${recording.id}?download=1`
        : null,
    });
    meetingGroups.set(key, group);
  }

  return [...Array.from(eventGroups.values()), ...Array.from(meetingGroups.values())].sort((a, b) =>
    (b.occurredAt ?? "").localeCompare(a.occurredAt ?? ""),
  );
}
