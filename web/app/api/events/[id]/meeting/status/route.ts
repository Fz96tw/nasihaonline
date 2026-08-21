import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { EventError, getEventMeetingStatus } from "@/lib/events-server";

/**
 * GET /api/events/:id/meeting/status — polled by MeetingWaitingRoom
 * (meeting-join-experience). Deliberately unauthenticated-reachable: access
 * control lives inside getEventMeetingStatus, which only allows a signed-
 * out caller through for an `open` event (same permissiveness as the
 * plain meetingUrl already emailed to anonymous registrants today).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  const { id } = await params;

  try {
    const status = await getEventMeetingStatus(id, user?.id ?? null);
    return NextResponse.json(status);
  } catch (error) {
    if (error instanceof EventError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
