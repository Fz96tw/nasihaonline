import { NextResponse, type NextRequest } from "next/server";
import { resetMeetingOnRoomEmpty, verifyLiveKitWebhook } from "@/lib/livekit";

/**
 * Receives LiveKit's webhook events (LiveKit Meeting Infrastructure
 * initiative) — signature-verified via the project's own API key/secret
 * (see verifyLiveKitWebhook), same self-authenticating server-to-server
 * shape as the Stripe/Clerk webhook routes, and exempt from the CSRF
 * check + session auth in middleware.ts for the same reason (isWebhookRoute
 * matches any /api/webhooks/* path).
 *
 * Only `room_finished` is handled today — see resetMeetingOnRoomEmpty's
 * doc comment. A future objective (4) can extend this same route to also
 * handle `egress_ended` (recording) once the storage-destination decision
 * is made, rather than adding a second webhook route.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  // livekit-server-sdk exports authorizeHeader === "Authorize" and its own
  // WebhookReceiver JSDoc calls it the "Authorization" header — the two
  // disagree with each other. Empirically (live testing, 2026-08-24: 400s
  // on every real delivery, confirmed via nginx + app logs) LiveKit Cloud
  // actually signs and sends the JWT in the standard `Authorization`
  // header, not `Authorize`. Reading the SDK's own constant here silently
  // returns null and every webhook 400s forever with no log line (see
  // verifyLiveKitWebhook's early return) — read the real header instead.
  const authHeader = request.headers.get("authorization");

  const event = await verifyLiveKitWebhook(rawBody, authHeader);
  if (!event) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  if (event.event === "room_finished" && event.room?.name) {
    await resetMeetingOnRoomEmpty(event.room.name);
    console.log(`[livekit] room_finished received, reset meeting for room ${event.room.name}`);
  }

  return NextResponse.json({ received: true });
}
