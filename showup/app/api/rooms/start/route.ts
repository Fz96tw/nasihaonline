import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createLiveKitRoom, getLiveRoomStatus, mintLiveKitToken } from "@/lib/livekit";
import { roomNameForCode } from "@/lib/room-code";
import { isSameOrigin } from "@/lib/same-origin";
import { firstIssueMessage, roomRequestSchema } from "@/lib/rooms-api";
import type { RoomCredentials } from "@/lib/room-types";

export const dynamic = "force-dynamic";

const UNAVAILABLE = "Showup is temporarily unavailable. Please try again in a moment.";

/**
 * Starts a meeting for a code. Minimal in-use guard only: if the code's room
 * already has people in it, refuse rather than let a second starter become
 * host of someone else's meeting. The atomic claim (no race between two
 * simultaneous starters), host reclaim after refresh, and rate limits arrive
 * with the room-state objective.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const parsed = roomRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  const { code, name } = parsed.data;

  const roomName = roomNameForCode(code);
  const status = await getLiveRoomStatus(roomName);
  if (!status) return NextResponse.json({ error: UNAVAILABLE }, { status: 503 });
  if (status.numParticipants > 0) {
    return NextResponse.json({ error: "That code is already in use. Pick another one." }, { status: 409 });
  }

  if (!(await createLiveKitRoom(roomName))) return NextResponse.json({ error: UNAVAILABLE }, { status: 503 });

  const identity = `host-${randomUUID()}`;
  const credentials = await mintLiveKitToken(roomName, identity, name, "host");
  if (!credentials) return NextResponse.json({ error: UNAVAILABLE }, { status: 503 });

  const body: RoomCredentials = { ...credentials, role: "host", identity, code };
  return NextResponse.json(body);
}
