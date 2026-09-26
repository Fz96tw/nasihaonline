import { NextResponse } from "next/server";
import { z } from "zod";
import { mintLobbyHostToken } from "@/lib/livekit";
import { isLobbyEnabled, lobbyRoomName, setLobbyEnabled } from "@/lib/lobby";
import { codeDigest, normalizeCode } from "@/lib/room-code";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getRoomState, secretsMatch } from "@/lib/room-state";
import { isSameOrigin } from "@/lib/same-origin";
import { tooManyRequestsResponse, unavailableResponse } from "@/lib/rooms-api";

export const dynamic = "force-dynamic";

const schema = z.object({
  code: z.string().transform(normalizeCode),
  hostSecret: z.string().min(1).max(128),
  action: z.enum(["set", "connect"]),
  enabled: z.boolean().optional(),
});

const LOBBY_LIMIT = { limit: 120, windowSeconds: 60 * 60 };

/**
 * Host-only lobby control. `set` turns the lobby on or off for guests who join
 * from now on (already-waiting guests are left where they are). `connect`
 * returns the current state plus a hidden, subscribe-only token for the host's
 * second connection to the lobby room. Host proof is the same hostSecret used
 * for reclaiming host and recording control.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { code, hostSecret, action, enabled } = parsed.data;
  if (action === "set" && enabled === undefined) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const digest = codeDigest(code);
  try {
    const state = await getRoomState(digest);
    if (!state || !secretsMatch(state.hostSecret, hostSecret)) {
      return NextResponse.json({ error: "Only the host can control the lobby." }, { status: 403 });
    }
    const limited = await rateLimit(`lobby:ip:${clientIp(request)}`, LOBBY_LIMIT);
    if (!limited.success) return tooManyRequestsResponse(limited.reset);

    if (action === "set") await setLobbyEnabled(digest, enabled === true);

    const credentials = await mintLobbyHostToken(lobbyRoomName(digest), state.hostIdentity);
    if (!credentials) return unavailableResponse();
    return NextResponse.json({ enabled: await isLobbyEnabled(digest), ...credentials });
  } catch (error) {
    console.error("[rooms/lobby] dependency failure", error);
    return unavailableResponse();
  }
}
