import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { getMeetingRequestMeetingStatus, MeetingRequestError } from "@/lib/meeting-requests-server";
import { getRoomMetadata, updateRoomMetadata } from "@/lib/livekit";
import { stopEgress } from "@/lib/livekit-egress";

/**
 * Same shape as the Event route (see
 * app/api/events/[id]/meeting/recording/stop/route.ts) but NOT restricted
 * to host/co-host — see this file's sibling start route for why a
 * MeetingRequest stays open to either participant.
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

    const current = await getRoomMetadata(status.livekitRoomName);
    if (!current?.recording || !current.egressId) {
      return NextResponse.json({ error: "Nothing is currently recording." }, { status: 409 });
    }

    await stopEgress(current.egressId);
    await updateRoomMetadata(status.livekitRoomName, { recording: false, egressId: null });
    return NextResponse.json({ recording: false });
  } catch (error) {
    if (error instanceof MeetingRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
