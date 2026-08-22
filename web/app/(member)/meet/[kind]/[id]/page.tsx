import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { EventError, getEventMeetingStatus } from "@/lib/events-server";
import { getMeetingRequestMeetingStatus, MeetingRequestError } from "@/lib/meeting-requests-server";
import { MeetingWaitingRoom, type MeetingWaitingRoomStatus } from "@/components/calendar/meeting-waiting-room";
import { BackLink } from "@/components/back-link";

export const metadata: Metadata = {
  title: "Join Meeting — NASIHA",
};

/**
 * Shared in-app waiting-room/countdown page (meeting-join-experience) for
 * both Event and MeetingRequest Meet links — `kind` picks which server
 * function/API routes back it, `id` is that entity's own id (Event.seriesId
 * for a recurring event's master row, MeetingRequest.id for a 1:1).
 *
 * Access control is entirely delegated to getEventMeetingStatus/
 * getMeetingRequestMeetingStatus — this page adds no restriction of its
 * own beyond redirecting an unauthenticated visitor to sign-in when the
 * entity isn't reachable without one (kind "request" always; kind "event"
 * only when the event isn't `open`).
 */
export default async function MeetPage({ params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params;
  if (kind !== "event" && kind !== "request") notFound();

  const user = await getSessionUser();
  if (kind === "request" && !user) redirect("/sign-in");

  // This page is reachable from many places (calendar list, event detail,
  // dashboard schedule widget, notification, emailed link), so there's no
  // single "correct" fixed destination — BackLink prefers in-app history
  // and only falls back to this when the page was opened directly. Event
  // links to the event's own detail page; a meeting request has no
  // standalone detail page, only its Inbox thread.
  const backHref = kind === "event" ? `/calendar/${id}` : `/inbox?item=${id}`;

  let status: MeetingWaitingRoomStatus | null = null;
  let deniedMessage: string | null = null;
  try {
    status =
      kind === "event"
        ? await getEventMeetingStatus(id, user?.id ?? null)
        : await getMeetingRequestMeetingStatus(id, user!.id);
  } catch (error) {
    if (error instanceof EventError || error instanceof MeetingRequestError) {
      if (error.status === 403 && !user) redirect("/sign-in");
      if (error.status === 404) notFound();
      deniedMessage = error.message;
    } else {
      throw error;
    }
  }

  if (deniedMessage || !status) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col items-center justify-center gap-4 p-8 text-center">
        <BackLink
          fallbackHref={backHref}
          className="inline-flex items-center gap-1 self-start text-sm text-muted-foreground hover:underline"
        />
        <h1 className="text-2xl font-bold tracking-tight">Can&apos;t open this meeting</h1>
        <p className="text-muted-foreground">{deniedMessage}</p>
      </main>
    );
  }

  if (!status.configured) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col items-center justify-center gap-4 p-8 text-center">
        <BackLink
          fallbackHref={backHref}
          className="inline-flex items-center gap-1 self-start text-sm text-muted-foreground hover:underline"
        />
        <h1 className="text-2xl font-bold tracking-tight">No meeting link yet</h1>
        <p className="text-muted-foreground">This meeting doesn&apos;t have a video link set up.</p>
      </main>
    );
  }

  // Already live — skip straight to Meet, but only for a non-organizer who
  // doesn't need to click through the Code of Conduct gate first.
  // meetingStartedAt has no "ended" concept (no Meet API polling), so it
  // stays true forever after the first Start click — the organizer must
  // always be able to reach this page itself (to Join again after quitting,
  // or to Reset), never bounced straight past it the way an attendee is.
  // An open event's anonymous/first-time attendee instead renders the page
  // so MeetingWaitingRoom can show the click-through disclaimer.
  if (status.started && status.meetingUrl && !status.isOrganizer && !status.requiresCodeOfConductAgreement) {
    redirect(status.meetingUrl);
  }

  const statusEndpoint =
    kind === "event" ? `/api/events/${id}/meeting/status` : `/api/inbox/meeting-requests/${id}/meeting/status`;
  const startEndpoint =
    kind === "event" ? `/api/events/${id}/meeting/start` : `/api/inbox/meeting-requests/${id}/meeting/start`;
  const resetEndpoint =
    kind === "event" ? `/api/events/${id}/meeting/reset` : `/api/inbox/meeting-requests/${id}/meeting/reset`;
  const messageEndpoint =
    kind === "event" ? `/api/events/${id}/meeting/message` : `/api/inbox/meeting-requests/${id}/meeting/message`;

  return (
    <MeetingWaitingRoom
      initialStatus={status}
      statusEndpoint={statusEndpoint}
      startEndpoint={startEndpoint}
      resetEndpoint={resetEndpoint}
      messageEndpoint={messageEndpoint}
      backHref={backHref}
    />
  );
}
