import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createLiveKitRoom, getLiveRoomStatus, mintLiveKitToken } from "@/lib/livekit";
import { codeDigest, roomNameForCode } from "@/lib/room-code";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import {
  claimRoom,
  getRoomState,
  isPastGrace,
  newHostSecret,
  refreshRoom,
  releaseRoom,
  releaseStaleRoom,
  secretsMatch,
  type RoomState,
} from "@/lib/room-state";
import { isSameOrigin } from "@/lib/same-origin";
import { firstIssueMessage, roomRequestSchema, tooManyRequestsResponse, unavailableResponse } from "@/lib/rooms-api";
import type { RoomCredentials } from "@/lib/room-types";

export const dynamic = "force-dynamic";

const START_LIMIT = { limit: 10, windowSeconds: 60 * 60 };

/** Deliberately says nothing about the existing meeting: not who's in it, not whether it's live. */
const CODE_IN_USE = "That code is already in use. Pick another one.";

function inUseResponse() {
  return NextResponse.json({ error: CODE_IN_USE, codeInUse: true }, { status: 409 });
}

/**
 * Starts a meeting for a code. The first starter atomically claims the code in
 * Redis (`SET NX`), so of two simultaneous starters exactly one wins. Anyone
 * else is told the code is in use (never offered a way in). The winner gets a
 * `hostSecret`; presenting it later (after a refresh) reclaims host instead of
 * being refused. A claim whose LiveKit room is empty and old enough is treated
 * as abandoned, so a crashed host doesn't lock the code until the TTL.
 *
 * Any Redis/LiveKit failure answers 503 + Retry-After rather than a 500.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const parsed = roomRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  const { code, name, hostSecret: presentedSecret } = parsed.data;

  const digest = codeDigest(code);
  const roomName = roomNameForCode(code);

  try {
    // Reclaim: the caller proves they are the host who claimed this code. Checked
    // before the rate limit so a host's page refreshes don't spend their start budget.
    const existing = await getRoomState(digest);
    if (existing && secretsMatch(existing.hostSecret, presentedSecret)) {
      if (!(await createLiveKitRoom(roomName))) return unavailableResponse();
      const credentials = await mintLiveKitToken(roomName, existing.hostIdentity, name, "host");
      if (!credentials) return unavailableResponse();
      await refreshRoom(digest);
      const body: RoomCredentials = {
        ...credentials,
        role: "host",
        identity: existing.hostIdentity,
        code,
        name,
        hostSecret: existing.hostSecret,
      };
      return NextResponse.json(body);
    }

    const limited = await rateLimit(`start:ip:${clientIp(request)}`, START_LIMIT);
    if (!limited.success) return tooManyRequestsResponse(limited.reset);

    const identity = `host-${randomUUID()}`;
    const state: RoomState = { hostIdentity: identity, hostSecret: newHostSecret(), createdAt: Date.now() };

    let claimed = await claimRoom(digest, state);
    if (!claimed) {
      // Maybe the previous host vanished without LiveKit telling us. Only take
      // over if the room is verifiably empty and the claim isn't brand new.
      const current = await getRoomState(digest);
      if (current && isPastGrace(current)) {
        const status = await getLiveRoomStatus(roomName);
        if (!status) return unavailableResponse();
        if (status.numParticipants === 0 && (await releaseStaleRoom(digest, current))) {
          claimed = await claimRoom(digest, state);
        }
      }
    }
    if (!claimed) return inUseResponse();

    // We hold the claim. Make sure the room really is free and LiveKit is reachable; roll back the claim if not.
    const status = await getLiveRoomStatus(roomName);
    if (!status) {
      await releaseRoom(digest);
      return unavailableResponse();
    }
    if (status.numParticipants > 0) {
      // A live room with no claim (e.g. the claim TTL lapsed mid-meeting). Not ours to take.
      await releaseRoom(digest);
      return inUseResponse();
    }
    if (!(await createLiveKitRoom(roomName))) {
      await releaseRoom(digest);
      return unavailableResponse();
    }

    const credentials = await mintLiveKitToken(roomName, identity, name, "host");
    if (!credentials) {
      await releaseRoom(digest);
      return unavailableResponse();
    }

    const body: RoomCredentials = {
      ...credentials,
      role: "host",
      identity,
      code,
      name,
      hostSecret: state.hostSecret,
    };
    return NextResponse.json(body);
  } catch (error) {
    console.error("[rooms/start] dependency failure", error);
    return unavailableResponse();
  }
}
