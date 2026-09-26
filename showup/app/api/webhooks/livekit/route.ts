import { NextResponse } from "next/server";
import { getRoomMetadata, updateRoomMetadata, verifyLiveKitWebhook } from "@/lib/livekit";
import { stopEgress } from "@/lib/livekit-egress";
import { digestFromRoomName } from "@/lib/room-code";
import { maybeSendRecordingEmail } from "@/lib/recording-email";
import { applyEgressResult, markRoomFinished } from "@/lib/recordings";
import { getRoomState, refreshRoom, releaseRoom } from "@/lib/room-state";

export const dynamic = "force-dynamic";

/**
 * LiveKit server webhooks. Authenticated by the signed JWT LiveKit puts in the
 * standard `Authorization` header (verified against our API key/secret), so
 * anyone else POSTing here is rejected. The shared LiveKit also serves Nasiha's
 * rooms, so events for rooms without the `showup-` prefix are acknowledged and ignored.
 *
 * - `room_finished`: the room emptied and closed, so the code is freed at once.
 * - participant join/leave: proof the meeting is alive, so the claim's TTL is
 *   pushed out; the host leaving also stops any recording in progress.
 * - `egress_ended`: a recording part finished (or failed); stored against its
 *   recording and, once the meeting is over, triggers the optional email. (If webhooks never arrive, e.g. local dev, the TTL frees the code.)
 *
 * A Redis failure answers 503 so LiveKit retries the delivery.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const event = await verifyLiveKitWebhook(rawBody, request.headers.get("authorization"));
  if (!event) return NextResponse.json({ error: "Invalid webhook." }, { status: 400 });

  try {
    // A finished recording part. The egress carries our room name, but we look the
    // recording up by egress id (unknown egresses, e.g. Nasiha's, are ignored).
    if (event.event === "egress_ended" && event.egressInfo) {
      const recId = await applyEgressResult(event.egressInfo);
      if (recId) await maybeSendRecordingEmail(recId);
      return NextResponse.json({ ok: true });
    }

    const roomName = event.room?.name;
    const digest = roomName ? digestFromRoomName(roomName) : null;
    if (!roomName || !digest) return NextResponse.json({ ok: true });

    if (event.event === "room_finished") {
      await releaseRoom(digest);
      const recId = await markRoomFinished(digest);
      if (recId) await maybeSendRecordingEmail(recId);
    } else if (event.event === "participant_joined" || event.event === "participant_left") {
      await refreshRoom(digest);
      // The host leaving ends any recording in progress (guests can't keep it going).
      if (event.event === "participant_left") {
        const state = await getRoomState(digest);
        if (state && event.participant?.identity === state.hostIdentity) {
          const metadata = await getRoomMetadata(roomName);
          if (metadata?.recording && metadata.egressId) {
            await stopEgress(metadata.egressId);
            await updateRoomMetadata(roomName, { recording: false, egressId: null });
          }
        }
      }
    }
  } catch (error) {
    console.error("[webhooks/livekit] Redis failure handling", event.event, error);
    return NextResponse.json({ error: "Temporarily unavailable." }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}
