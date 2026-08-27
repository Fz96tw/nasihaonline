import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { EventError, getEventMeetingStatus } from "@/lib/events-server";
import { getMeetingRequestMeetingStatus, MeetingRequestError } from "@/lib/meeting-requests-server";
import { MeetingWaitingRoom, type MeetingWaitingRoomStatus } from "@/components/calendar/meeting-waiting-room";
import { BackLink } from "@/components/back-link";
import { Button } from "@/components/ui/button";

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
export default async function MeetPage({
  params,
  searchParams,
}: {
  params: Promise<{ kind: string; id: string }>;
  searchParams: Promise<{ rid?: string }>;
}) {
  const { kind, id } = await params;
  // `rid` (EventRegistration.id) rides only on an event's emailed join link
  // (sendEventRegistrationConfirmationEmail/sendEventRegistrationReminderEmail).
  // Passed into getEventMeetingStatus below (now the actual enforcement of
  // registration for an anonymous caller, not just how the link is handed
  // out — see that function's doc comment) and threaded into every event
  // endpoint an anonymous browser calls (statusEndpoint/tokenEndpoint/
  // chatEndpoint below), which each independently re-validate it. Meaningless
  // for kind "request" (no anonymous-guest concept there).
  const { rid } = await searchParams;
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
        ? await getEventMeetingStatus(id, user?.id ?? null, rid ?? null)
        : await getMeetingRequestMeetingStatus(id, user!.id);
  } catch (error) {
    if (error instanceof EventError || error instanceof MeetingRequestError) {
      // Only the "this event isn't open, sign in instead" 403 redirects —
      // getEventMeetingStatus's other anonymous 403 ("register for this
      // event") means signing in wouldn't help, so that one falls through
      // to the denied-message card below instead (with a link to register).
      if (error.status === 403 && !user && error instanceof EventError && error.requiresSignIn) {
        redirect("/sign-in");
      }
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
        {/* The only anonymous-caller 403 that reaches this card (rather than
            redirecting to /sign-in above) is getEventMeetingStatus's
            "register for this event" case — give a direct path to fix it. */}
        {kind === "event" && !user && (
          <Button asChild>
            <a href={`/events/${id}`}>Register for this event</a>
          </Button>
        )}
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

  // Appended to every event endpoint an anonymous guest's browser actually
  // calls (status poll, token mint, chat archive) — each independently
  // re-validates it via getEventMeetingStatus, not just the token route.
  const ridQuery = rid ? `?rid=${encodeURIComponent(rid)}` : "";
  const statusEndpoint =
    kind === "event"
      ? `/api/events/${id}/meeting/status${ridQuery}`
      : `/api/inbox/meeting-requests/${id}/meeting/status`;
  const startEndpoint =
    kind === "event" ? `/api/events/${id}/meeting/start` : `/api/inbox/meeting-requests/${id}/meeting/start`;
  const resetEndpoint =
    kind === "event" ? `/api/events/${id}/meeting/reset` : `/api/inbox/meeting-requests/${id}/meeting/reset`;
  const messageEndpoint =
    kind === "event" ? `/api/events/${id}/meeting/message` : `/api/inbox/meeting-requests/${id}/meeting/message`;
  const tokenEndpoint =
    kind === "event" ? `/api/events/${id}/meeting/token${ridQuery}` : `/api/inbox/meeting-requests/${id}/meeting/token`;
  const recordingStartEndpoint =
    kind === "event"
      ? `/api/events/${id}/meeting/recording/start`
      : `/api/inbox/meeting-requests/${id}/meeting/recording/start`;
  const recordingStopEndpoint =
    kind === "event"
      ? `/api/events/${id}/meeting/recording/stop`
      : `/api/inbox/meeting-requests/${id}/meeting/recording/stop`;
  // Event-only (Recording Access initiative) — a MeetingRequest has no co-host concept.
  const coHostsEndpoint = kind === "event" ? `/api/events/${id}/meeting/co-hosts` : null;
  const kickEndpoint =
    kind === "event" ? `/api/events/${id}/meeting/kick` : `/api/inbox/meeting-requests/${id}/meeting/kick`;
  // A MeetingRequest has no discussion thread — its chat compiles into a
  // MeetingRequestMessage on the Inbox timeline instead of a ForumPost
  // (finalizeMeetingRequestChatTranscript, meeting-requests-server.ts).
  const chatEndpoint =
    kind === "event" ? `/api/events/${id}/meeting/chat${ridQuery}` : `/api/inbox/meeting-requests/${id}/meeting/chat`;

  return (
    <MeetingWaitingRoom
      initialStatus={status}
      statusEndpoint={statusEndpoint}
      startEndpoint={startEndpoint}
      resetEndpoint={resetEndpoint}
      messageEndpoint={messageEndpoint}
      tokenEndpoint={tokenEndpoint}
      recordingStartEndpoint={recordingStartEndpoint}
      recordingStopEndpoint={recordingStopEndpoint}
      coHostsEndpoint={coHostsEndpoint}
      kickEndpoint={kickEndpoint}
      chatEndpoint={chatEndpoint}
      backHref={backHref}
    />
  );
}
