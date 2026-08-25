import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { EventError, getEventMeetingStatus } from "@/lib/events-server";
import { setRoomRecordingMetadata } from "@/lib/livekit";
import { startEgress } from "@/lib/livekit-egress";

/**
 * POST /api/events/:id/meeting/recording/start — starts a new recording
 * segment for the caller's currently-live LiveKit meeting (objective 4).
 * Deliberately open to ANY attendee, not just the organizer — same
 * decision as the objective's Planning notes — so authorization here is
 * identical to the token route's (getEventMeetingStatus), not narrowed to
 * isOrganizer. Repeatable: calling this again after a prior stop starts a
 * brand-new segment (LiveKit's egress API has no pause/resume).
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  const { id } = await params;

  try {
    const status = await getEventMeetingStatus(id, user?.id ?? null);
    if (!status.started || !status.livekitRoomName) {
      return NextResponse.json({ error: "This meeting hasn't started yet." }, { status: 409 });
    }

    const result = await startEgress(status.livekitRoomName);
    if ("error" in result) {
      return NextResponse.json({ error: "Couldn't start recording. Try again shortly." }, { status: 502 });
    }

    await setRoomRecordingMetadata(status.livekitRoomName, { recording: true, egressId: result.egressId });
    return NextResponse.json({ recording: true, egressId: result.egressId });
  } catch (error) {
    if (error instanceof EventError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
