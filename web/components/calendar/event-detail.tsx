"use client";

import { useState } from "react";
import Link from "next/link";
import { Pencil, Users, Video } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RsvpButton } from "@/components/calendar/rsvp-button";
import { AddToCalendarButton } from "@/components/calendar/add-to-calendar-button";
import { EventViewCounter } from "@/components/calendar/event-view-counter";
import { ManageInvitees } from "@/components/calendar/manage-invitees";
import { CancelEventButton } from "@/components/calendar/cancel-event-button";
import { ResendNotifications } from "@/components/calendar/resend-notifications";
import { RecordingRow } from "@/components/calendar/recording-row";
import { AttendanceChecklist } from "@/components/calendar/attendance-checklist";
import {
  EVENT_TYPE_LABELS,
  getEventAudienceBadge,
  ROSTER_STATUS_LABEL,
  ROSTER_STATUS_VARIANT,
  type AttendanceChecklistMember,
  type EventRegistrationAttendee,
  type EventRosterMember,
  type EventRsvpAttendee,
  type MemberEvent,
} from "@/lib/events";
import type { DirectoryMember } from "@/lib/members";
import { useHasMounted } from "@/lib/use-has-mounted";
import { formatDurationMinutes, formatTimestamp } from "@/lib/format-date";
import { FEED_TYPE_LABELS } from "@/lib/feed";
import { EventVisibility } from "@/lib/generated/prisma/enums";
import type { EventNotificationBroadcastItem } from "@/lib/events";

function formatEventDateRange(startsAt: string, endsAt: string | null) {
  const start = new Date(startsAt);
  const startLabel = start.toLocaleString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  if (!endsAt) return startLabel;

  const end = new Date(endsAt);
  const sameDay = start.toDateString() === end.toDateString();
  const endLabel = end.toLocaleString(undefined, sameDay ? { hour: "numeric", minute: "2-digit" } : {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${startLabel} – ${endLabel}`;
}

/** /calendar/[eventId] (§4.6) — single-event detail: full description, host, RSVP, and add-to-calendar. */
export function EventDetail({
  event: initialEvent,
  canEdit,
  isHost,
  attendees,
  hostProfile,
  roster,
  attendanceChecklist,
  notificationBroadcasts,
}: {
  event: MemberEvent;
  canEdit: boolean;
  /** True only for the event's actual organizer (not an admin viewing someone else's event) — hides the RSVP button and gates the "Join session link" open regardless of RSVP status, since the host never auto-RSVPs to their own event. */
  isHost: boolean;
  attendees: { rsvps: EventRsvpAttendee[]; registrations: EventRegistrationAttendee[] } | null;
  /** Host's Directory profile, if they're directory-listed and tier-eligible (§4.3/§9) — null otherwise, in which case the avatar shows initials only and isn't clickable. */
  hostProfile: DirectoryMember | null;
  /** Full invitee roster for a restricted event (Objective 02) — visible to every invited member, not just the organizer. Null for a community event. */
  roster: EventRosterMember[] | null;
  /** Host/admin-facing attendance checklist (Objective 04) — non-null only once a restricted event's startsAt has passed and the viewer can edit it. */
  attendanceChecklist: AttendanceChecklistMember[] | null;
  /** Resend Notifications' history trail — non-null only for a community event when canEdit (host/admin), matching resendEventNotifications' own gate. */
  notificationBroadcasts: EventNotificationBroadcastItem[] | null;
}) {
  const [event, setEvent] = useState(initialEvent);
  const hasMounted = useHasMounted();
  // Only used to build each RecordingRow's copyUrl (never rendered into
  // the DOM), so the SSR-time "" fallback never causes a hydration
  // mismatch — see recording-row.tsx's doc comment for why the copied
  // link needs to be absolute rather than a relative path.
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const isPast = hasMounted && new Date(event.endsAt ?? event.startsAt) < new Date();
  // LiveKit gives a real "meeting genuinely ended" signal (room_finished,
  // stamped as meetingEndedAt); Meet has no equivalent, so its recording
  // link keeps gating on the scheduled isPast time above.
  const isRecordingAvailable = event.livekitRoomName ? event.meetingEndedAt !== null : isPast;
  // Per-segment visibility, not gated by isRecordingAvailable alone: a
  // ready or failed segment is a terminal state and stays visible even
  // once a newer, unrelated session starts (which resets meetingEndedAt
  // to null) — only a still-pending segment waits for its own session to
  // end before showing a "processing" placeholder. Labels are computed
  // from each segment's position in the FULL list before filtering, so
  // "Part N" numbering never shifts based on what's currently visible.
  const visibleLiveKitSegments = event.liveKitRecordingSegments
    .map((segment, index) => ({
      segment,
      label: event.liveKitRecordingSegments.length > 1 ? `Part ${index + 1}` : "Watch recording",
    }))
    .filter(({ segment }) => segment.ready || segment.failed || isRecordingAvailable);
  const hostName = event.hostName ?? "NASIHA Member";
  const audienceBadge = getEventAudienceBadge(event);
  const showJoinLink = !isPast && (event.rsvped || isHost) && (event.meetingUrl || event.livekitRoomName);
  const showRecordingUrl = isRecordingAvailable && event.recordingUrl;
  const hasMeetingSection =
    showJoinLink || showRecordingUrl || visibleLiveKitSegments.length > 0 || event.chatTranscriptPostId;

  function handleRsvpToggled(result: {
    rsvped: boolean;
    meetingUrl: string | null;
    livekitRoomName: string | null;
    attendeeCount?: number;
  }) {
    setEvent((prev) => ({ ...prev, ...result }));
  }

  return (
    <div className="flex flex-col gap-6">
      {event.heroImageUrl && (
        <div className="flex h-72 w-full items-center justify-center overflow-hidden rounded-lg bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element -- MinIO-proxied URL, see Avatar's same rationale */}
          <img
            src={event.heroImageUrl}
            alt={event.title}
            className="h-full w-full object-cover"
          />
        </div>
      )}

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{FEED_TYPE_LABELS.event}</p>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Badge variant={audienceBadge.variant}>{audienceBadge.label}</Badge>
          <Badge variant="neutral">{EVENT_TYPE_LABELS[event.type]}</Badge>
          {!roster && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground" title="Registered or RSVP'd">
              <Users className="h-3.5 w-3.5" />
              {event.attendeeCount}
            </span>
          )}
          <EventViewCounter eventId={event.seriesId} initialViews={event.viewCount} />
          {event.isRecurring && event.recurrenceSummary ? (
            <Badge variant="neutral" title={event.recurrenceSummary}>
              {event.recurrenceSummary}
            </Badge>
          ) : null}
        </div>
        <h1 className="mb-1 text-3xl font-bold tracking-tight">{event.title}</h1>
        {hostProfile ? (
          <Link
            href={`/members/${hostProfile.id}`}
            aria-label={`View ${hostName}'s profile`}
            className="flex items-center gap-3 text-left"
          >
            <Avatar name={hostName} src={hostProfile.avatarUrl} size="md" />
            <div>
              {event.hostName ? <p className="text-sm text-muted-foreground">Hosted by {event.hostName}</p> : null}
              <p className="text-sm text-muted-foreground">
                {hasMounted ? formatEventDateRange(event.startsAt, event.endsAt) : null}
              </p>
            </div>
          </Link>
        ) : (
          <div className="flex items-center gap-3">
            <Avatar name={hostName} size="md" />
            <div>
              {event.hostName ? <p className="text-sm text-muted-foreground">Hosted by {event.hostName}</p> : null}
              <p className="text-sm text-muted-foreground">
                {hasMounted ? formatEventDateRange(event.startsAt, event.endsAt) : null}
              </p>
            </div>
          </div>
        )}
      </div>

      {isPast ? (
        <div className="rounded-lg border bg-muted px-4 py-3 text-sm text-muted-foreground">
          This event has already taken place.
        </div>
      ) : null}

      {hasMeetingSection ? (
        <div className="flex flex-col gap-3 border-t pt-6">
          <h2 className="text-sm font-semibold">Meeting</h2>

          {showJoinLink ? (
            <Button size="sm" asChild className="w-fit">
              <Link href={`/meet/event/${event.seriesId}`}>
                <Video className="mr-1.5 h-4 w-4" />
                Join session link
              </Link>
            </Button>
          ) : null}

          {showRecordingUrl ? (
            <RecordingRow
              label="Watch recording"
              meta={null}
              status="ready"
              watchHref={event.recordingUrl!}
              downloadHref={`/api/events/${event.seriesId}/recording/download?occurrence=${encodeURIComponent(event.startsAt)}`}
              copyUrl={event.recordingUrl!}
              copyLabel="Copy recording link"
              deleteUrl={
                canEdit
                  ? `/api/events/${event.seriesId}/recording?occurrence=${encodeURIComponent(event.startsAt)}`
                  : null
              }
              onDeleted={() => setEvent((prev) => ({ ...prev, recordingUrl: null }))}
            />
          ) : null}

          {visibleLiveKitSegments.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-muted-foreground">Recording</span>
              <div className="flex flex-col gap-1.5">
                {visibleLiveKitSegments.map(({ segment, label }) => (
                  <RecordingRow
                    key={segment.id}
                    label={label}
                    meta={
                      segment.ready
                        ? `${segment.durationSeconds !== null ? `${formatDurationMinutes(segment.durationSeconds)} · ` : ""}${formatTimestamp(segment.startedAt)}`
                        : `Started ${formatTimestamp(segment.startedAt)}`
                    }
                    status={segment.ready ? "ready" : segment.failed ? "failed" : "processing"}
                    watchHref={segment.ready ? `/api/events/${event.seriesId}/recording/${segment.id}` : null}
                    downloadHref={
                      segment.ready ? `/api/events/${event.seriesId}/recording/${segment.id}?download=1` : null
                    }
                    copyUrl={
                      segment.ready ? `${origin}/api/events/${event.seriesId}/recording/${segment.id}` : null
                    }
                    copyLabel={`Copy ${label.toLowerCase()} link`}
                    deleteUrl={canEdit ? `/api/events/${event.seriesId}/recording/${segment.id}` : null}
                    onDeleted={() =>
                      setEvent((prev) => ({
                        ...prev,
                        liveKitRecordingSegments: prev.liveKitRecordingSegments.filter((s) => s.id !== segment.id),
                      }))
                    }
                  />
                ))}
              </div>
            </div>
          ) : null}

          {event.chatTranscriptPostId ? (
            <Link
              href={`#post-${event.chatTranscriptPostId}`}
              className="w-fit text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              View chat transcript
            </Link>
          ) : null}
        </div>
      ) : null}

      {event.description ? (
        <p className="whitespace-pre-line text-sm leading-relaxed">{event.description}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        {!isPast && !isHost && <RsvpButton eventId={event.seriesId} rsvped={event.rsvped} onToggled={handleRsvpToggled} />}
        {!isPast && (
          <AddToCalendarButton
            eventId={event.seriesId}
            occurrenceIso={event.isRecurring ? event.startsAt : undefined}
          />
        )}
        {canEdit && (
          <Button size="sm" variant="outline" asChild>
            <Link href={`/calendar/${event.seriesId}/edit`}>
              <Pencil className="mr-1.5 h-4 w-4" />
              Edit Event
            </Link>
          </Button>
        )}
        {canEdit && <CancelEventButton eventId={event.seriesId} title={event.title} />}
      </div>

      {roster ? (
        canEdit ? (
          <ManageInvitees eventId={event.seriesId} initialRoster={roster} />
        ) : (
          <div className="flex flex-col gap-2 border-t pt-6">
            <h2 className="text-sm font-semibold">Invited members ({roster.length})</h2>
            <ul className="flex flex-col divide-y">
              {roster.map((member) => (
                <li key={member.userId} className="flex items-center justify-between gap-3 py-2">
                  <div className="flex items-center gap-2">
                    <Avatar name={member.name ?? "Member"} src={member.avatarUrl} size="xs" />
                    <span className="text-sm">{member.name ?? "A member"}</span>
                  </div>
                  <Badge variant={ROSTER_STATUS_VARIANT[member.status]}>{ROSTER_STATUS_LABEL[member.status]}</Badge>
                </li>
              ))}
            </ul>
          </div>
        )
      ) : null}

      {canEdit && !roster && attendees ? (
        <div className="flex flex-col gap-4 border-t pt-6">
          <div>
            <h2 className="mb-2 text-sm font-semibold">RSVP&apos;d members ({attendees.rsvps.length})</h2>
            {attendees.rsvps.length === 0 ? (
              <p className="text-sm text-muted-foreground">No RSVPs yet.</p>
            ) : (
              <ul className="text-sm text-muted-foreground">
                {attendees.rsvps.map((rsvp) => (
                  <li key={rsvp.id}>{rsvp.name ?? "A member"}</li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h2 className="mb-2 text-sm font-semibold">Registered guests ({attendees.registrations.length})</h2>
            {attendees.registrations.length === 0 ? (
              <p className="text-sm text-muted-foreground">No registrations yet.</p>
            ) : (
              <ul className="text-sm text-muted-foreground">
                {attendees.registrations.map((registration) => (
                  <li key={registration.id}>
                    {registration.name ?? "Guest"} — {registration.email}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      {attendanceChecklist ? (
        <AttendanceChecklist
          eventId={event.seriesId}
          occurrenceDate={event.startsAt}
          initialMembers={attendanceChecklist}
        />
      ) : null}

      {canEdit && notificationBroadcasts ? (
        <ResendNotifications
          eventId={event.seriesId}
          restricted={event.visibility === EventVisibility.invited}
          initialBroadcasts={notificationBroadcasts}
        />
      ) : null}
    </div>
  );
}
