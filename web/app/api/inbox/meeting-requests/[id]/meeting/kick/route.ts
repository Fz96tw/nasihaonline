import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { getMeetingRequestMeetingStatus, MeetingRequestError } from "@/lib/meeting-requests-server";
import { removeLiveKitParticipant } from "@/lib/livekit";

const kickSchema = z.object({
  identity: z.string().min(1),
});

/**
 * POST /api/inbox/meeting-requests/:id/meeting/kick — force-disconnects the
 * other party from the live LiveKit call. A MeetingRequest is always a
 * private 2-party 1:1 with no co-host concept (unlike Event), so only the
 * sender/organizer may call this — enforced here
 * (getMeetingRequestMeetingStatus.isOrganizer), not just hidden in the UI.
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
    const status = await getMeetingRequestMeetingStatus(id, user.id);
    if (!status.started || !status.livekitRoomName) {
      return NextResponse.json({ error: "This meeting hasn't started yet." }, { status: 409 });
    }
    if (!status.isOrganizer) {
      return NextResponse.json(
        { error: "Only the meeting organizer can remove the other participant." },
        { status: 403 },
      );
    }
    if (parsed.data.identity === user.id) {
      return NextResponse.json({ error: "Can't remove yourself from the meeting." }, { status: 400 });
    }

    const removed = await removeLiveKitParticipant(status.livekitRoomName, parsed.data.identity);
    if (!removed) {
      return NextResponse.json({ error: "Couldn't remove that participant. Try again." }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof MeetingRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
