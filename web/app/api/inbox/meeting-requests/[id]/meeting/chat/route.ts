import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getMeetingRequestMeetingStatus, MeetingRequestError } from "@/lib/meeting-requests-server";

/**
 * POST /api/inbox/meeting-requests/:id/meeting/chat — stages one LiveKit
 * in-meeting chat message for later compilation into the meeting request's
 * Inbox timeline (finalizeMeetingRequestChatTranscript,
 * meeting-requests-server.ts, runs on the room_finished webhook). Same auth
 * shape as the token route: always signed-in (requireUser()) — a
 * MeetingRequest is always a private 2-party 1:1, so unlike the Event chat
 * route there's no anonymous/guest case to handle.
 *
 * Identity/name for the stored row come only from the caller's own session,
 * never the request body — ChatCaptureListener (livekit-meeting-screen.tsx)
 * only ever reports messages the local participant itself sent, so the
 * sender here is always the authenticated caller.
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

  const payload = await request.json().catch(() => null);
  if (!payload?.id || typeof payload.id !== "string" || !payload.message || typeof payload.message !== "string") {
    return NextResponse.json({ error: "Missing id or message." }, { status: 400 });
  }
  if (typeof payload.timestamp !== "number") {
    return NextResponse.json({ error: "Missing timestamp." }, { status: 400 });
  }

  try {
    const status = await getMeetingRequestMeetingStatus(id, user.id);
    if (!status.started || !status.livekitRoomName) {
      return NextResponse.json({ error: "This meeting hasn't started yet." }, { status: 409 });
    }

    await db.meetingRequestChatMessage.upsert({
      where: { meetingRequestId_livekitMessageId: { meetingRequestId: id, livekitMessageId: payload.id } },
      create: {
        meetingRequestId: id,
        livekitMessageId: payload.id,
        authorName: user.name ?? "there",
        authorUserId: user.id,
        body: payload.message,
        sentAt: new Date(payload.timestamp),
      },
      update: {},
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof MeetingRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
