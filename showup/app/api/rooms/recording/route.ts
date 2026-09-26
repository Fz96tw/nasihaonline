import { NextResponse } from "next/server";
import { z } from "zod";
import { getLiveRoomStatus, getRoomMetadata, updateRoomMetadata } from "@/lib/livekit";
import { startEgress, stopEgress } from "@/lib/livekit-egress";
import { codeDigest, normalizeCode, roomNameForCode } from "@/lib/room-code";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { ensureRecording, registerEgress, sha256 } from "@/lib/recordings";
import { getRoomState, secretsMatch } from "@/lib/room-state";
import { isSameOrigin } from "@/lib/same-origin";
import { tooManyRequestsResponse, unavailableResponse } from "@/lib/rooms-api";

export const dynamic = "force-dynamic";

const schema = z.object({
  code: z.string().transform(normalizeCode),
  hostSecret: z.string().min(1).max(128),
  action: z.enum(["start", "stop"]),
});

const RECORDING_LIMIT = { limit: 30, windowSeconds: 60 * 60 };

/**
 * Host-only recording control. The caller proves they are the host by
 * presenting the hostSecret minted when they started the meeting (same proof
 * as reclaiming host), so a guest, or a different host who later reuses the
 * code, can't start or stop it. Recording state is broadcast to everyone via
 * LiveKit room metadata, which is what drives the guests' "being recorded"
 * banner: nothing here trusts the client to say whether a recording is on.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { code, hostSecret, action } = parsed.data;

  const digest = codeDigest(code);
  const roomName = roomNameForCode(code);

  try {
    const state = await getRoomState(digest);
    if (!state || !secretsMatch(state.hostSecret, hostSecret)) {
      return NextResponse.json({ error: "Only the host can control recording." }, { status: 403 });
    }
    const limited = await rateLimit(`recording:ip:${clientIp(request)}`, RECORDING_LIMIT);
    if (!limited.success) return tooManyRequestsResponse(limited.reset);

    const metadata = await getRoomMetadata(roomName);

    if (action === "stop") {
      if (!metadata?.recording || !metadata.egressId) {
        return NextResponse.json({ error: "Nothing is being recorded." }, { status: 409 });
      }
      if (!(await stopEgress(metadata.egressId))) {
        return NextResponse.json({ error: "Couldn't stop the recording. Try again." }, { status: 502 });
      }
      await updateRoomMetadata(roomName, { recording: false, egressId: null });
      return NextResponse.json({ ok: true, recId: state.recId });
    }

    if (metadata?.recording) return NextResponse.json({ error: "Already recording." }, { status: 409 });
    const room = await getLiveRoomStatus(roomName);
    if (!room) return unavailableResponse();
    if (!room.exists || room.numParticipants === 0) {
      return NextResponse.json({ error: "Join the showup session before recording." }, { status: 409 });
    }

    await ensureRecording({
      recId: state.recId,
      digest,
      roomName,
      secretHash: sha256(hostSecret),
      passcodeSalt: state.passcodeSalt,
      passcodeHash: state.passcodeHash,
      createdAt: state.createdAt,
    });

    const started = await startEgress(roomName);
    if ("error" in started) {
      console.error("[recording] start failed:", started.error);
      const notConfigured = started.error.includes("isn't configured");
      return NextResponse.json(
        { error: notConfigured ? "Recording isn't available right now." : "Couldn't start the recording. Try again in a moment." },
        { status: notConfigured ? 503 : 502 },
      );
    }
    await registerEgress(state.recId, started.egressId);
    await updateRoomMetadata(roomName, { recording: true, egressId: started.egressId });
    return NextResponse.json({ ok: true, recId: state.recId });
  } catch (error) {
    console.error("[rooms/recording] dependency failure", error);
    return unavailableResponse();
  }
}
