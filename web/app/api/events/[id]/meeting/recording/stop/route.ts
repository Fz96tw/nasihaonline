import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { EventError, getEventMeetingStatus } from "@/lib/events-server";
import { getRoomMetadata, updateRoomMetadata } from "@/lib/livekit";
import { stopEgress } from "@/lib/livekit-egress";

/**
 * POST /api/events/:id/meeting/recording/stop — stops the currently-active
 * recording segment, if any. Reads which egress is active from the room's
 * own metadata rather than trusting a client-supplied egressId — any
 * host/co-host can stop it, not just whoever happened to start it, so the
 * source of truth has to be server-side shared state, not local UI state.
 * Restricted to host/co-host (Recording Access initiative) — see start
 * route's comment.
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
      return NextResponse.json({ error: "Only the host or a co-host can stop this recording." }, { status: 403 });
    }

    const current = await getRoomMetadata(status.livekitRoomName);
    if (!current?.recording || !current.egressId) {
      return NextResponse.json({ error: "Nothing is currently recording." }, { status: 409 });
    }

    await stopEgress(current.egressId);
    await updateRoomMetadata(status.livekitRoomName, { recording: false, egressId: null });
    return NextResponse.json({ recording: false });
  } catch (error) {
    if (error instanceof EventError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
