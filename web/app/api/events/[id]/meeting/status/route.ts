import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { EventError, getEventMeetingStatus } from "@/lib/events-server";

/**
 * GET /api/events/:id/meeting/status — polled by MeetingWaitingRoom
 * (meeting-join-experience). Deliberately unauthenticated-reachable: access
 * control lives inside getEventMeetingStatus, which for a signed-out caller
 * now requires both an `open` event and a `?rid=` query param resolving to
 * a real registration for it — see getEventMeetingStatus's doc comment.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  const { id } = await params;
  const registrationId = new URL(request.url).searchParams.get("rid");

  try {
    const status = await getEventMeetingStatus(id, user?.id ?? null, registrationId);
    return NextResponse.json(status);
  } catch (error) {
    if (error instanceof EventError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
