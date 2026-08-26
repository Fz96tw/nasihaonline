import { NextResponse } from "next/server";
import { requireUser, AuthError, authErrorResponse } from "@/lib/auth";
import { EventError, getEventMeetRecordingDownloadUrl } from "@/lib/events-server";

/**
 * GET /api/events/:id/recording/download?occurrence=ISO — Meet-origin
 * recording's "Download recording" button. `occurrence` matches the same
 * query param the DELETE .../recording route already reads to resolve a
 * recurring event's occurrence. 302-redirects to a freshly-minted Drive
 * `webContentLink` rather than proxying bytes — see
 * getMeetingRecordingDownloadUrl's doc comment.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const { id } = await params;
  const occurrenceParam = new URL(request.url).searchParams.get("occurrence");
  const occurrenceDate = occurrenceParam ? new Date(occurrenceParam) : null;
  if (!occurrenceDate || Number.isNaN(occurrenceDate.getTime())) {
    return NextResponse.json({ error: "A valid occurrence date is required." }, { status: 400 });
  }

  try {
    const url = await getEventMeetRecordingDownloadUrl(id, occurrenceDate, user.id);
    return NextResponse.redirect(url, { status: 302 });
  } catch (error) {
    if (error instanceof EventError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
