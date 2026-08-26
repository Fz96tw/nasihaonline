import { NextResponse } from "next/server";
import { requireUser, AuthError, authErrorResponse } from "@/lib/auth";
import {
  deleteMeetingRequestRecordingSegment,
  MeetingRequestError,
  getMeetingRequestRecordingObjectKey,
} from "@/lib/meeting-requests-server";
import { getRecordingPresignedUrl } from "@/lib/recordings-storage";

/** Same shape/rationale as the Event route — see app/api/events/[id]/recording/[recordingId]/route.ts, including the `?download=1` variant. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string; recordingId: string }> }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const { id, recordingId } = await params;
  const isDownload = new URL(request.url).searchParams.get("download") === "1";

  try {
    const objectKey = await getMeetingRequestRecordingObjectKey(id, recordingId, user.id);
    const url = await getRecordingPresignedUrl(objectKey, isDownload ? objectKey.split("/").pop() : undefined);
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

/** DELETE /api/inbox/meeting-requests/:id/recording/:recordingId — sender only (enforced inside deleteMeetingRequestRecordingSegment). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; recordingId: string }> }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const { id, recordingId } = await params;

  try {
    await deleteMeetingRequestRecordingSegment(id, recordingId, user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof MeetingRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
