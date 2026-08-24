import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { getMeetingRequestMeetingStatus, MeetingRequestError } from "@/lib/meeting-requests-server";
import { mintLiveKitToken } from "@/lib/livekit";

/**
 * POST /api/inbox/meeting-requests/:id/meeting/token — mints a LiveKit join
 * token for the current caller (meeting-join-experience / LiveKit Meeting
 * Infrastructure). Already Clerk-gated at the middleware level (/api/inbox
 * is in isProtectedApiRoute); requireUser() here just gets the typed user
 * for the sender-or-recipient check inside getMeetingRequestMeetingStatus.
 * A MeetingRequest is always a private 2-party 1:1, so unlike the Event
 * route there's no anonymous/guest-identity case to handle.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const { id } = await params;

  try {
    const status = await getMeetingRequestMeetingStatus(id, user.id);
    if (!status.started || !status.livekitRoomName) {
      return NextResponse.json({ error: "This meeting hasn't started yet." }, { status: 409 });
    }

    const credentials = await mintLiveKitToken(status.livekitRoomName, user.id, user.name ?? "there", status.isOrganizer);
    if (!credentials) {
      return NextResponse.json({ error: "Couldn't connect to the meeting. Try again shortly." }, { status: 502 });
    }
    return NextResponse.json(credentials);
  } catch (error) {
    if (error instanceof MeetingRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
