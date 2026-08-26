import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { attachLiveKitEventRecordingSegment, EventError, getEventMeetingStatus } from "@/lib/events-server";
import { updateRoomMetadata } from "@/lib/livekit";
import { startEgress } from "@/lib/livekit-egress";

/**
 * POST /api/events/:id/meeting/recording/start — starts a new recording
 * segment for the caller's currently-live LiveKit meeting (objective 4).
 * Restricted to the host or a designated co-host (Recording Access
 * initiative) — previously open to ANY attendee; reversed by request.
 * Repeatable: calling this again after a prior stop starts a brand-new
 * segment (LiveKit's egress API has no pause/resume).
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  const { id } = await params;

  try {
    const status = await getEventMeetingStatus(id, user?.id ?? null);
    if (!status.started || !status.livekitRoomName) {
      return NextResponse.json({ error: "This meeting hasn't started yet." }, { status: 409 });
    }
    if (!status.isHostOrCoHost) {
      return NextResponse.json({ error: "Only the host or a co-host can record this meeting." }, { status: 403 });
    }

    const result = await startEgress(status.livekitRoomName);
    if ("error" in result) {
      return NextResponse.json({ error: "Couldn't start recording. Try again shortly." }, { status: 502 });
    }

    // Create the segment row now, not just when egress_ended eventually
    // arrives (can be minutes later) — gives the detail page something to
    // show ("processing…") instead of dead silence in the meantime.
    await attachLiveKitEventRecordingSegment(status.livekitRoomName, {
      egressId: result.egressId,
      objectKey: null,
      startedAt: new Date(),
    });

    await updateRoomMetadata(status.livekitRoomName, { recording: true, egressId: result.egressId });
    return NextResponse.json({ recording: true, egressId: result.egressId });
  } catch (error) {
    if (error instanceof EventError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
