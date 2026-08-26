import { NextResponse } from "next/server";
import { requireUser, AuthError, authErrorResponse } from "@/lib/auth";
import { MeetingRequestError, getMeetingRequestMeetRecordingDownloadUrl } from "@/lib/meeting-requests-server";

/** Same shape/rationale as the Event route — see app/api/events/[id]/recording/download/route.ts. */
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
    const url = await getMeetingRequestMeetRecordingDownloadUrl(id, user.id);
    return NextResponse.redirect(url, { status: 302 });
  } catch (error) {
    if (error instanceof MeetingRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
