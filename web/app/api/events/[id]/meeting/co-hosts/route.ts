import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { EventError, getEventMeetingStatus, setEventCoHost } from "@/lib/events-server";
import { updateRoomMetadata } from "@/lib/livekit";

const setCoHostSchema = z.object({
  userId: z.string(),
  isCoHost: z.boolean(),
});

/**
 * POST /api/events/:id/meeting/co-hosts — grants or revokes co-host status
 * for another attendee (Recording Access initiative). Only the host or an
 * existing co-host may call this — enforced inside setEventCoHost(), not
 * just hidden in the UI. The event's meeting must be live: co-host
 * assignment ahead of a meeting goes through the event edit form instead
 * (a separate, host-only write path), not this endpoint.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = setCoHostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const status = await getEventMeetingStatus(id, user.id);
    if (!status.started || !status.livekitRoomName) {
      return NextResponse.json({ error: "This meeting hasn't started yet." }, { status: 409 });
    }

    const coHostUserIds = await setEventCoHost(id, user.id, parsed.data.userId, parsed.data.isCoHost);
    await updateRoomMetadata(status.livekitRoomName, { coHostUserIds });
    return NextResponse.json({ coHostUserIds });
  } catch (error) {
    if (error instanceof EventError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
