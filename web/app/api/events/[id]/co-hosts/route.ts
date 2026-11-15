import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { EventError, updateEventCoHosts } from "@/lib/events-server";
import { updateRoomMetadata } from "@/lib/livekit";

const updateCoHostsSchema = z.object({
  addUserIds: z.array(z.string()).default([]),
  removeUserIds: z.array(z.string()).default([]),
});

/**
 * PATCH /api/events/:id/co-hosts — adds and/or removes co-hosts on a Nasiha
 * Conference event after it's published, for any visibility, whether or
 * not the meeting has started. Host, co-host, or admin only, enforced
 * inside updateEventCoHosts(). If the meeting is live, the new list is also
 * mirrored into the room metadata so connected clients' co-host badges and
 * controls update right away (same as the in-meeting
 * /meeting/co-hosts toggle).
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = updateCoHostsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await updateEventCoHosts(id, user, parsed.data);
    if (result.meetingLive && result.livekitRoomName) {
      await updateRoomMetadata(result.livekitRoomName, { coHostUserIds: result.coHostUserIds });
    }
    return NextResponse.json({ coHostUserIds: result.coHostUserIds });
  } catch (error) {
    if (error instanceof EventError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
