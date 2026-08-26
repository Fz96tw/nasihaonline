import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import {
  attachLiveKitMeetingRequestRecordingSegment,
  getMeetingRequestMeetingStatus,
  MeetingRequestError,
} from "@/lib/meeting-requests-server";
import { updateRoomMetadata } from "@/lib/livekit";
import { startEgress } from "@/lib/livekit-egress";

/**
 * Same shape as the Event route (see
 * app/api/events/[id]/meeting/recording/start/route.ts) but NOT restricted
 * to host/co-host — the Recording Access initiative's host/co-host model
 * is Event-specific ("assigned by the event organizer when scheduling the
 * event"); a MeetingRequest is a 1:1 call with only two participants
 * (getMeetingRequestMeetingStatus already scopes access to them), so it
 * stays open to either side.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
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
    if (!status.started || !status.livekitRoomName) {
      return NextResponse.json({ error: "This meeting hasn't started yet." }, { status: 409 });
    }

    const result = await startEgress(status.livekitRoomName);
    if ("error" in result) {
      return NextResponse.json({ error: "Couldn't start recording. Try again shortly." }, { status: 502 });
    }

    // Create the segment row now, not just when egress_ended eventually
    // arrives — see the Event route's sibling comment.
    await attachLiveKitMeetingRequestRecordingSegment(status.livekitRoomName, {
      egressId: result.egressId,
      objectKey: null,
      startedAt: new Date(),
    });

    await updateRoomMetadata(status.livekitRoomName, { recording: true, egressId: result.egressId });
    return NextResponse.json({ recording: true, egressId: result.egressId });
  } catch (error) {
    if (error instanceof MeetingRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
