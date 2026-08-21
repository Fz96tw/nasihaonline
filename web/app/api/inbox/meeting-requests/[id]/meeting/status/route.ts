import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { getMeetingRequestMeetingStatus, MeetingRequestError } from "@/lib/meeting-requests-server";

/**
 * GET /api/inbox/meeting-requests/:id/meeting/status — polled by
 * MeetingWaitingRoom (meeting-join-experience). Already Clerk-gated at the
 * middleware level (/api/inbox is in isProtectedApiRoute); requireUser()
 * here just gets the typed user for the sender-or-recipient check below.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
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
    return NextResponse.json(status);
  } catch (error) {
    if (error instanceof MeetingRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
