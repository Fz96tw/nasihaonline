import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { EventError, getEventMeetingStatus } from "@/lib/events-server";

/**
 * POST /api/events/:id/meeting/chat — stages one LiveKit in-meeting chat
 * message for later compilation into the event's discussion thread
 * (finalizeEventChatTranscript, events-server.ts, runs on the room_finished
 * webhook). Same auth shape as the token route: deliberately
 * unauthenticated-reachable, access control lives entirely inside
 * getEventMeetingStatus.
 *
 * Identity/name for the stored row come only from the caller's own session
 * (mirroring the token route's mintLiveKitToken call), never from the
 * request body — ChatCaptureListener (livekit-meeting-screen.tsx) only ever
 * reports messages the local participant itself sent, so the sender here is
 * always the authenticated caller, not a claim the client could forge on
 * another participant's behalf.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  const { id } = await params;

  const payload = await request.json().catch(() => null);
  if (!payload?.id || typeof payload.id !== "string" || !payload.message || typeof payload.message !== "string") {
    return NextResponse.json({ error: "Missing id or message." }, { status: 400 });
  }
  if (typeof payload.timestamp !== "number") {
    return NextResponse.json({ error: "Missing timestamp." }, { status: 400 });
  }

  try {
    const status = await getEventMeetingStatus(id, user?.id ?? null);
    if (!status.started || !status.livekitRoomName) {
      return NextResponse.json({ error: "This meeting hasn't started yet." }, { status: 409 });
    }

    await db.eventChatMessage.upsert({
      where: { eventId_livekitMessageId: { eventId: id, livekitMessageId: payload.id } },
      create: {
        eventId: id,
        livekitMessageId: payload.id,
        authorName: user?.name ?? "Guest",
        authorUserId: user?.id ?? null,
        body: payload.message,
        sentAt: new Date(payload.timestamp),
      },
      update: {},
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof EventError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
