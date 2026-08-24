import { NextResponse, type NextRequest } from "next/server";
import { authorizeHeader } from "livekit-server-sdk";
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
  // LiveKit sends its signature in a header literally named "Authorize"
  // (per the SDK's own authorizeHeader export) — not the standard
  // "Authorization" header used by every other webhook provider in this
  // codebase. Easy to get wrong; confirmed by reading the SDK source.
  const authHeader = request.headers.get(authorizeHeader);

  const event = await verifyLiveKitWebhook(rawBody, authHeader);
  if (!event) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  if (event.event === "room_finished" && event.room?.name) {
    await resetMeetingOnRoomEmpty(event.room.name);
  }

  return NextResponse.json({ received: true });
}
