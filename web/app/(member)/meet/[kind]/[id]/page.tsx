import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { EventError, getEventMeetingStatus } from "@/lib/events-server";
import { getMeetingRequestMeetingStatus, MeetingRequestError } from "@/lib/meeting-requests-server";
import { MeetingWaitingRoom, type MeetingWaitingRoomStatus } from "@/components/calendar/meeting-waiting-room";

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
        <h1 className="text-2xl font-bold tracking-tight">Can&apos;t open this meeting</h1>
        <p className="text-muted-foreground">{deniedMessage}</p>
      </main>
    );
  }

  if (!status.configured) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight">No meeting link yet</h1>
        <p className="text-muted-foreground">This meeting doesn&apos;t have a video link set up.</p>
      </main>
    );
  }

  // Already live — skip the waiting room entirely.
  if (status.started && status.meetingUrl) {
    redirect(status.meetingUrl);
  }

  const statusEndpoint =
    kind === "event" ? `/api/events/${id}/meeting/status` : `/api/inbox/meeting-requests/${id}/meeting/status`;
  const startEndpoint =
    kind === "event" ? `/api/events/${id}/meeting/start` : `/api/inbox/meeting-requests/${id}/meeting/start`;
  const messageEndpoint =
    kind === "event" ? `/api/events/${id}/meeting/message` : `/api/inbox/meeting-requests/${id}/meeting/message`;

  return (
    <MeetingWaitingRoom
      initialStatus={status}
      statusEndpoint={statusEndpoint}
      startEndpoint={startEndpoint}
      messageEndpoint={messageEndpoint}
    />
  );
}
