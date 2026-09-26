import { NextResponse } from "next/server";
import { z } from "zod";
import { removeLiveKitParticipant, sendLobbyMessage } from "@/lib/livekit";
import { approveGuest, lobbyRoomName, rejectGuest } from "@/lib/lobby";
import { codeDigest, normalizeCode } from "@/lib/room-code";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getRoomState, secretsMatch } from "@/lib/room-state";
import { isSameOrigin } from "@/lib/same-origin";
import { tooManyRequestsResponse, unavailableResponse } from "@/lib/rooms-api";

export const dynamic = "force-dynamic";

const schema = z.object({
  code: z.string().transform(normalizeCode),
  hostSecret: z.string().min(1).max(128),
  identity: z.string().min(1).max(128),
  decision: z.enum(["approve", "reject"]),
});

const DECISION_LIMIT = { limit: 300, windowSeconds: 60 * 60 };

/**
 * Host decision on one waiting guest. Approve stores a one-time ticket (the
 * guest record moves pending -> approved atomically) and tells the guest over
 * the lobby room; the guest then redeems it for a main-room token. Reject
 * removes the guest from the lobby and blocks their identity and IP for the
 * code for a while. Either way a guest can only be decided once.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { code, hostSecret, identity, decision } = parsed.data;

  const digest = codeDigest(code);
  const lobbyRoom = lobbyRoomName(digest);
  try {
    const state = await getRoomState(digest);
    if (!state || !secretsMatch(state.hostSecret, hostSecret)) {
      return NextResponse.json({ error: "Only the host can admit guests." }, { status: 403 });
    }
    const limited = await rateLimit(`lobby-decision:ip:${clientIp(request)}`, DECISION_LIMIT);
    if (!limited.success) return tooManyRequestsResponse(limited.reset);

    const done = decision === "approve" ? await approveGuest(digest, identity) : await rejectGuest(digest, identity);
    if (!done) return NextResponse.json({ error: "That guest is no longer waiting." }, { status: 409 });

    await sendLobbyMessage(lobbyRoom, identity, { type: decision === "approve" ? "approved" : "rejected" });
    if (decision === "reject") await removeLiveKitParticipant(lobbyRoom, identity);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[rooms/lobby/decision] dependency failure", error);
    return unavailableResponse();
  }
}
