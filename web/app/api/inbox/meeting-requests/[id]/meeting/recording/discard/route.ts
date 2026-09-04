import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import {
  discardMeetingRequestRecordingSegment,
  getMeetingRequestMeetingStatus,
  MeetingRequestError,
} from "@/lib/meeting-requests-server";
import { getRoomMetadata, updateRoomMetadata } from "@/lib/livekit";
import { stopEgress } from "@/lib/livekit-egress";

/**
 * Reset button (quick-recording only) — mirrors the stop route (same
 * status/metadata checks, same stopEgress + updateRoomMetadata calls) but
 * additionally soft-deletes the MeetingRequestRecording row created at
 * Record-click time, so the discarded segment never appears in the
 * dashboard's "My Quick Recordings" list or the insert-video picker. Not
 * restricted to host/co-host, same as start/stop — see those routes'
 * sibling comments for why a MeetingRequest stays open to either party.
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

    const egressId = current.egressId;
    await stopEgress(egressId);
    await updateRoomMetadata(status.livekitRoomName, { recording: false, egressId: null });
    await discardMeetingRequestRecordingSegment(egressId);

    return NextResponse.json({ recording: false });
  } catch (error) {
    if (error instanceof MeetingRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
