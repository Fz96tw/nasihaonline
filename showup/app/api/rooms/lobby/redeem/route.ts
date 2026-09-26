import { NextResponse } from "next/server";
import { z } from "zod";
import { getLiveRoomStatus, MAX_PARTICIPANTS, mintLiveKitToken } from "@/lib/livekit";
import { consumeApproval, peekGuest } from "@/lib/lobby";
import { codeDigest, normalizeCode, roomNameForCode } from "@/lib/room-code";
import { rateLimit } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/same-origin";
import { tooManyRequestsResponse, unavailableResponse } from "@/lib/rooms-api";
import type { RoomCredentials } from "@/lib/room-types";

export const dynamic = "force-dynamic";

const schema = z.object({
  code: z.string().transform(normalizeCode),
  identity: z.string().min(1).max(128),
  lobbySecret: z.string().min(1).max(128),
});

/** Per waiting guest; enough for a poll every couple of seconds for the whole token lifetime. */
const REDEEM_LIMIT = { limit: 4000, windowSeconds: 2 * 60 * 60 };

/**
 * A waiting guest asks whether they've been let in. Answers pending / rejected,
 * or, once approved, exchanges the one-time ticket for a main-room token.
 * The ticket is consumed atomically only after the room is confirmed to have
 * space, so a guest approved into a full room can try again, and two tabs
 * racing on one approval can't both get in.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { code, identity, lobbySecret } = parsed.data;

  const digest = codeDigest(code);
  try {
    const limited = await rateLimit(`lobby-redeem:${digest}:${identity}`, REDEEM_LIMIT);
    if (!limited.success) return tooManyRequestsResponse(limited.reset);

    const guest = await peekGuest(digest, identity, lobbySecret);
    if (guest.status === "unknown" || guest.status === "redeemed") {
      return NextResponse.json({ error: "This request has expired. Join again with the code." }, { status: 404 });
    }
    if (guest.status !== "approved") return NextResponse.json({ status: guest.status });

    const roomName = roomNameForCode(code);
    const room = await getLiveRoomStatus(roomName);
    if (!room) return unavailableResponse();
    if (!room.exists || room.numParticipants === 0) {
      return NextResponse.json({ error: "This meeting has ended." }, { status: 404 });
    }
    if (room.numParticipants >= MAX_PARTICIPANTS) {
      return NextResponse.json({ status: "full", error: "The meeting is full right now. Trying again…" });
    }

    // Mint first, consume second: a mint failure leaves the ticket intact for a retry, and a lost
    // consume race discards the token unused.
    const credentials = await mintLiveKitToken(roomName, identity, guest.name, "guest");
    if (!credentials) return unavailableResponse();
    if (!(await consumeApproval(digest, identity))) {
      return NextResponse.json({ error: "This request has expired. Join again with the code." }, { status: 404 });
    }
    const body: RoomCredentials = { ...credentials, role: "guest", identity, code, name: guest.name };
    return NextResponse.json({ status: "approved", credentials: body });
  } catch (error) {
    console.error("[rooms/lobby/redeem] dependency failure", error);
    return unavailableResponse();
  }
}
