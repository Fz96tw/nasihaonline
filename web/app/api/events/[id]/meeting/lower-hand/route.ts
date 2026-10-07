import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { EventError, getEventMeetingStatus } from "@/lib/events-server";
import { lowerParticipantHand } from "@/lib/livekit";

const lowerHandSchema = z.object({
  identity: z.string().min(1),
});

/**
 * POST /api/events/:id/meeting/lower-hand — clears another participant's
 * raised hand in the live LiveKit call. Only the host or a co-host may call
 * this — enforced here (getEventMeetingStatus.isHostOrCoHost), not just
 * hidden in the UI. A participant lowering their own hand doesn't come
 * through here at all; they clear their own attributes client-side.
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
  const parsed = lowerHandSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const status = await getEventMeetingStatus(id, user.id);
    if (!status.started || !status.livekitRoomName) {
      return NextResponse.json({ error: "This meeting hasn't started yet." }, { status: 409 });
    }
    if (!status.isHostOrCoHost) {
      return NextResponse.json({ error: "Only the host or a co-host can lower someone else's hand." }, { status: 403 });
    }

    const lowered = await lowerParticipantHand(status.livekitRoomName, parsed.data.identity);
    if (!lowered) {
      return NextResponse.json({ error: "Couldn't lower that hand. Try again." }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof EventError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
