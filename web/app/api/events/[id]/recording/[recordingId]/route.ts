import { NextResponse } from "next/server";
import { requireUser, AuthError, authErrorResponse } from "@/lib/auth";
import { deleteEventRecordingSegment, EventError, getEventRecordingObjectKey } from "@/lib/events-server";
import { getRecordingPresignedUrl } from "@/lib/recordings-storage";

/**
 * GET /api/events/:id/recording/:recordingId — the ONLY way a LiveKit
 * recording segment is ever reached (objective 4). Deliberately does the
 * access check here and then 302-redirects to a freshly-minted, short-lived
 * presigned MinIO URL rather than reading the object and proxying its bytes
 * through this route (the pattern lib/storage.ts's other proxy routes use
 * for avatars/documents/images) — a proxy would mean this Next.js server
 * process reads and re-streams every byte of a recording, and implementing
 * Range-request passthrough correctly on top of that is real extra work for
 * no benefit. A redirect lets the browser talk to MinIO directly, which
 * already supports HTTP Range requests natively — <video> scrubbing/seeking
 * just works. Never returns a stored/cached URL: MinIO/S3 presigned URLs
 * expire, so minting one fresh per click means the link in the UI never
 * goes stale even though the presigned URL underneath it does.
 *
 * `?download=1` mints the same redirect with a `response-content-disposition:
 * attachment` header attached (see getRecordingPresignedUrl), so the
 * "Download" button forces a save instead of opening the inline player.
 */
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
    const objectKey = await getEventRecordingObjectKey(id, recordingId, user.id);
    const url = await getRecordingPresignedUrl(objectKey, isDownload ? objectKey.split("/").pop() : undefined);
    if (!url) {
      return NextResponse.json({ error: "Recording storage isn't configured." }, { status: 502 });
    }
    return NextResponse.redirect(url, { status: 302 });
  } catch (error) {
    if (error instanceof EventError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

/** DELETE /api/events/:id/recording/:recordingId — host or admin only (enforced inside deleteEventRecordingSegment). */
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
    await deleteEventRecordingSegment(id, recordingId, user);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof EventError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
