import { NextResponse } from "next/server";
import { verifyLiveKitWebhook } from "@/lib/livekit";
import { digestFromRoomName } from "@/lib/room-code";
import { refreshRoom, releaseRoom } from "@/lib/room-state";

export const dynamic = "force-dynamic";

/**
 * LiveKit server webhooks. Authenticated by the signed JWT LiveKit puts in the
 * standard `Authorization` header (verified against our API key/secret), so
 * anyone else POSTing here is rejected. The shared LiveKit also serves Nasiha's
 * rooms, so events for rooms without the `showup-` prefix are acknowledged and ignored.
 *
 * - `room_finished`: the room emptied and closed, so the code is freed at once.
 * - participant join/leave: proof the meeting is alive, so the claim's TTL is
 *   pushed out. (If webhooks never arrive, e.g. local dev, the TTL frees the code.)
 *
 * A Redis failure answers 503 so LiveKit retries the delivery.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const event = await verifyLiveKitWebhook(rawBody, request.headers.get("authorization"));
  if (!event) return NextResponse.json({ error: "Invalid webhook." }, { status: 400 });

  const digest = event.room?.name ? digestFromRoomName(event.room.name) : null;
  if (!digest) return NextResponse.json({ ok: true });

  try {
    if (event.event === "room_finished") {
      await releaseRoom(digest);
    } else if (event.event === "participant_joined" || event.event === "participant_left") {
      await refreshRoom(digest);
    }
  } catch (error) {
    console.error("[webhooks/livekit] Redis failure handling", event.event, error);
    return NextResponse.json({ error: "Temporarily unavailable." }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}
