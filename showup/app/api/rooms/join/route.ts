import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getLiveRoomStatus, mintLiveKitToken } from "@/lib/livekit";
import { roomNameForCode } from "@/lib/room-code";
import { isSameOrigin } from "@/lib/same-origin";
import { firstIssueMessage, roomRequestSchema } from "@/lib/rooms-api";
import type { RoomCredentials } from "@/lib/room-types";

export const dynamic = "force-dynamic";

const UNAVAILABLE = "Showup is temporarily unavailable. Please try again in a moment.";

/**
 * Joins the live meeting for a code as a guest. A room only counts as live
 * while someone is actually in it: an empty room that lingers on LiveKit for
 * its empty timeout after the host left is treated the same as no meeting,
 * so a stale code never lands a guest alone in an empty room.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const parsed = roomRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  const { code, name } = parsed.data;

  const roomName = roomNameForCode(code);
  const status = await getLiveRoomStatus(roomName);
  if (!status) return NextResponse.json({ error: UNAVAILABLE }, { status: 503 });
  if (!status.exists || status.numParticipants === 0) {
    return NextResponse.json(
      { error: "No live meeting with that code. Check the code, or ask the host to start it first." },
      { status: 404 },
    );
  }

  const identity = `guest-${randomUUID()}`;
  const credentials = await mintLiveKitToken(roomName, identity, name, "guest");
  if (!credentials) return NextResponse.json({ error: UNAVAILABLE }, { status: 503 });

  const body: RoomCredentials = { ...credentials, role: "guest", identity, code };
  return NextResponse.json(body);
}
