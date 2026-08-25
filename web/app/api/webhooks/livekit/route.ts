import { EgressStatus } from "livekit-server-sdk";
import { NextResponse, type NextRequest } from "next/server";
import { resetMeetingOnRoomEmpty, verifyLiveKitWebhook } from "@/lib/livekit";
import { attachLiveKitEventRecordingSegment, markLiveKitEventRecordingSegmentFailed } from "@/lib/events-server";
import {
  attachLiveKitMeetingRequestRecordingSegment,
  markLiveKitMeetingRequestRecordingSegmentFailed,
} from "@/lib/meeting-requests-server";

/**
 * Receives LiveKit's webhook events (LiveKit Meeting Infrastructure
 * initiative) — signature-verified via the project's own API key/secret
 * (see verifyLiveKitWebhook), same self-authenticating server-to-server
 * shape as the Stripe/Clerk webhook routes, and exempt from the CSRF
 * check + session auth in middleware.ts for the same reason (isWebhookRoute
 * matches any /api/webhooks/* path).
 *
 * Handles `room_finished` (see resetMeetingOnRoomEmpty's doc comment) and,
 * as of objective 4, `egress_ended` — a finished recording segment gets
 * attached to whichever Event/MeetingRequest owns the room. A
 * malformed/incomplete egress_ended payload (missing roomName, no
 * successful file result, an owning row that's since vanished) is logged
 * and skipped rather than thrown — this route must never 500 on a webhook
 * payload it doesn't like, same as the signature-verification failure path
 * below.
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

  if (event.event === "egress_ended") {
    await handleEgressEnded(event.egressInfo);
  }

  return NextResponse.json({ received: true });
}

async function handleEgressEnded(egressInfo: NonNullable<Awaited<ReturnType<typeof verifyLiveKitWebhook>>>["egressInfo"]) {
  try {
    if (!egressInfo?.roomName || !egressInfo.egressId) {
      console.warn("[livekit] egress_ended payload missing roomName/egressId — skipping");
      return;
    }
    const file = egressInfo.fileResults?.[0];
    const failed =
      egressInfo.status === EgressStatus.EGRESS_FAILED ||
      egressInfo.status === EgressStatus.EGRESS_ABORTED ||
      !file?.filename;

    if (failed || !file) {
      console.warn(`[livekit] egress ${egressInfo.egressId} ended with status ${egressInfo.status}: ${egressInfo.error || "no file result"}`);
      // Mark the pending row (created at Record-click time) as failed
      // rather than leaving it stuck showing "processing" forever.
      const markedEvent = await markLiveKitEventRecordingSegmentFailed(egressInfo.egressId);
      if (!markedEvent) await markLiveKitMeetingRequestRecordingSegmentFailed(egressInfo.egressId);
      return;
    }

    const segment = {
      egressId: egressInfo.egressId,
      objectKey: file.filename,
      // startedAt is unix nanoseconds as a bigint on the wire.
      startedAt: file.startedAt ? new Date(Number(file.startedAt / BigInt(1_000_000))) : new Date(),
      // duration is also nanoseconds on the wire; undefined (not 0) when
      // absent so the upsert's `durationSeconds: segment.durationSeconds`
      // doesn't overwrite with 0 for a payload that omitted it.
      durationSeconds: file.duration ? Number(file.duration / BigInt(1_000_000_000)) : undefined,
    };

    const attachedToEvent = await attachLiveKitEventRecordingSegment(egressInfo.roomName, segment);
    if (!attachedToEvent) {
      const attachedToMeetingRequest = await attachLiveKitMeetingRequestRecordingSegment(egressInfo.roomName, segment);
      if (!attachedToMeetingRequest) {
        console.warn(`[livekit] egress_ended for room ${egressInfo.roomName} matched no Event or MeetingRequest`);
      }
    }
  } catch (error) {
    // Never let a malformed/unexpected payload crash the webhook route —
    // the underlying recording file already exists in MinIO regardless of
    // whether this DB write succeeds; a lost webhook delivery just means a
    // recording that isn't linked in the app, not a lost file.
    console.error("[livekit] Failed to handle egress_ended", error);
  }
}
