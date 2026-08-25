import { NextResponse } from "next/server";
import { requireUser, AuthError, authErrorResponse } from "@/lib/auth";
import { MeetingRequestError, getMeetingRequestRecordingObjectKey } from "@/lib/meeting-requests-server";
import { getRecordingPresignedUrl } from "@/lib/recordings-storage";

/** Same shape/rationale as the Event route — see app/api/events/[id]/recording/[recordingId]/route.ts. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; recordingId: string }> }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const { id, recordingId } = await params;

  try {
    const objectKey = await getMeetingRequestRecordingObjectKey(id, recordingId, user.id);
    const url = await getRecordingPresignedUrl(objectKey);
    if (!url) {
      return NextResponse.json({ error: "Recording storage isn't configured." }, { status: 502 });
    }
    return NextResponse.redirect(url, { status: 302 });
  } catch (error) {
    if (error instanceof MeetingRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
