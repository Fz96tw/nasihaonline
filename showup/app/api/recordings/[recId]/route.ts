import { NextResponse } from "next/server";
import { clientIp } from "@/lib/rate-limit";
import { maybeSendRecordingEmail, isEmailConfigured } from "@/lib/recording-email";
import { authorizeRecording } from "@/lib/recordings-api";
import { describeRecording, reconcile, readPendingEmail } from "@/lib/recordings";
import { unavailableResponse } from "@/lib/rooms-api";

export const dynamic = "force-dynamic";

/**
 * Status + fresh 15-minute download links for one recording. Auth is the
 * hostSecret in the `x-host-secret` header (a header, not the URL, so it stays
 * out of logs and referrers). Every call also reconciles with LiveKit, so the
 * exit screen's polling makes progress even if the egress_ended webhook never
 * arrives.
 */
export async function GET(request: Request, { params }: { params: { recId: string } }) {
  try {
    const auth = await authorizeRecording(clientIp(request), params.recId, request.headers.get("x-host-secret"));
    if ("response" in auth) return auth.response;

    await reconcile(params.recId, auth.meta);
    // A queued "email me the link" may only have become sendable now.
    await maybeSendRecordingEmail(params.recId).catch(() => undefined);
    const view = await describeRecording(auth.meta);
    return NextResponse.json({
      ...view,
      emailAvailable: isEmailConfigured(),
      emailQueued: (await readPendingEmail(params.recId)) !== null,
    });
  } catch (error) {
    console.error("[recordings] dependency failure", error);
    return unavailableResponse();
  }
}
