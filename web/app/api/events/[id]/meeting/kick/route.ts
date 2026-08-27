import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { EventError, getEventMeetingStatus } from "@/lib/events-server";
import { removeLiveKitParticipant } from "@/lib/livekit";

const kickSchema = z.object({
  identity: z.string().min(1),
});

/**
 * POST /api/events/:id/meeting/kick — force-disconnects a participant from
 * the live LiveKit call. Only the host or an existing co-host may call
 * this — enforced here (getEventMeetingStatus.isHostOrCoHost), not just
 * hidden in the UI — and the host itself can never be targeted.
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
  const parsed = kickSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const status = await getEventMeetingStatus(id, user.id);
    if (!status.started || !status.livekitRoomName) {
      return NextResponse.json({ error: "This meeting hasn't started yet." }, { status: 409 });
    }
    if (!status.isHostOrCoHost) {
      return NextResponse.json({ error: "Only the host or a co-host can remove participants." }, { status: 403 });
    }
    if (parsed.data.identity === status.hostId) {
      return NextResponse.json({ error: "Can't remove the host from the meeting." }, { status: 400 });
    }

    const removed = await removeLiveKitParticipant(status.livekitRoomName, parsed.data.identity);
    if (!removed) {
      return NextResponse.json({ error: "Couldn't remove that participant. Try again." }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof EventError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
