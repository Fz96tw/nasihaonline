import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { MeetingRequestError, startMeetingRequestMeeting } from "@/lib/meeting-requests-server";

/** POST /api/inbox/meeting-requests/:id/meeting/start — sender-only (meeting-join-experience). Marks the meeting live. */
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
    await startMeetingRequestMeeting(id, user.id);
    return NextResponse.json({ started: true });
  } catch (error) {
    if (error instanceof MeetingRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
