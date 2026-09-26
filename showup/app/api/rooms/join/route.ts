import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getLiveRoomStatus, MAX_PARTICIPANTS, mintLiveKitToken, mintLobbyGuestToken } from "@/lib/livekit";
import { addPendingGuest, isBlocked, isLobbyEnabled, lobbyRoomName } from "@/lib/lobby";
import { codeDigest, roomNameForCode } from "@/lib/room-code";
import { clientIp, isRateLimited, rateLimit } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/same-origin";
import { firstIssueMessage, roomRequestSchema, tooManyRequestsResponse, unavailableResponse } from "@/lib/rooms-api";
import type { RoomCredentials } from "@/lib/room-types";

export const dynamic = "force-dynamic";

const JOIN_IP_LIMIT = { limit: 60, windowSeconds: 60 * 60 };
/** Guesses at one code from anywhere, to slow someone brute-forcing a specific meeting. */
const JOIN_CODE_LIMIT = { limit: 30, windowSeconds: 10 * 60 };
/** Wrong-code attempts per IP. Only failures spend this budget, so real guests aren't affected. */
const BAD_CODE_LIMIT = { limit: 10, windowSeconds: 10 * 60 };

/**
 * Joins the live meeting for a code as a guest. A room only counts as live
 * while someone is actually in it: an empty room that lingers on LiveKit for
 * its empty timeout after the host left is treated the same as no meeting,
 * so a stale code never lands a guest alone in an empty room.
 *
 * Wrong-code guesses are rate limited (429), and a Redis/LiveKit outage
 * answers 503 + Retry-After rather than a 500.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const parsed = roomRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  const { code, name } = parsed.data;

  const ip = clientIp(request);
  const badCodeKey = `joinfail:ip:${ip}`;

  try {
    if (await isRateLimited(badCodeKey, BAD_CODE_LIMIT.limit)) return tooManyRequestsResponse();
    const byIp = await rateLimit(`join:ip:${ip}`, JOIN_IP_LIMIT);
    if (!byIp.success) return tooManyRequestsResponse(byIp.reset);
    const byCode = await rateLimit(`join:code:${codeDigest(code)}`, JOIN_CODE_LIMIT);
    if (!byCode.success) return tooManyRequestsResponse(byCode.reset);

    const roomName = roomNameForCode(code);
    const status = await getLiveRoomStatus(roomName);
    if (!status) return unavailableResponse();
    if (!status.exists || status.numParticipants === 0) {
      await rateLimit(badCodeKey, BAD_CODE_LIMIT);
      return NextResponse.json(
        { error: "No live showup session with that code. Check the code, or ask the host to start it first." },
        { status: 404 },
      );
    }
    if (status.numParticipants >= MAX_PARTICIPANTS) {
      return NextResponse.json({ error: "This showup session is full." }, { status: 409 });
    }

    // A guest the host rejected can't retry for a while, lobby on or not.
    if (await isBlocked(codeDigest(code), ip)) {
      return NextResponse.json({ error: "The host declined your request to join this showup session." }, { status: 403 });
    }

    const identity = `guest-${randomUUID()}`;

    // Lobby on: the guest gets a lobby token only, never a main-room token. That
    // holds for late joiners too, since this is the only place a guest token is minted.
    if (await isLobbyEnabled(codeDigest(code))) {
      const lobbyCredentials = await mintLobbyGuestToken(lobbyRoomName(codeDigest(code)), identity, name);
      if (!lobbyCredentials) return unavailableResponse();
      const lobbySecret = await addPendingGuest(codeDigest(code), identity, name, ip);
      const lobbyBody: RoomCredentials = { ...lobbyCredentials, role: "guest", identity, code, name, lobby: true, lobbySecret };
      return NextResponse.json(lobbyBody);
    }

    const credentials = await mintLiveKitToken(roomName, identity, name, "guest");
    if (!credentials) return unavailableResponse();

    const body: RoomCredentials = { ...credentials, role: "guest", identity, code, name };
    return NextResponse.json(body);
  } catch (error) {
    console.error("[rooms/join] dependency failure", error);
    return unavailableResponse();
  }
}
