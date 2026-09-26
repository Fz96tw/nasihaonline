import { NextResponse } from "next/server";
import { z } from "zod";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { isEmailConfigured, maybeSendRecordingEmail } from "@/lib/recording-email";
import { authorizeRecording } from "@/lib/recordings-api";
import { hasEmailClaim, reconcile, savePendingEmail, sha256 } from "@/lib/recordings";
import { isSameOrigin } from "@/lib/same-origin";
import { tooManyRequestsResponse, unavailableResponse } from "@/lib/rooms-api";

export const dynamic = "force-dynamic";

const schema = z.object({ hostSecret: z.string().min(1).max(128), email: z.string().trim().email().max(200) });

const EMAIL_IP_LIMIT = { limit: 5, windowSeconds: 60 * 60 };
const EMAIL_ADDRESS_LIMIT = { limit: 3, windowSeconds: 60 * 60 };

/**
 * "Email me the link". Needs the hostSecret (so only the host can ask), is rate
 * limited per IP and per address, sends exactly one email per recording with a
 * fixed template, and never accepts a second address (the first request wins).
 * The mail itself goes out from the webhook/poll once the meeting has finished
 * and all parts are ready; see maybeSendRecordingEmail.
 */
export async function POST(request: Request, { params }: { params: { recId: string } }) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  const { hostSecret, email } = parsed.data;

  try {
    const ip = clientIp(request);
    const auth = await authorizeRecording(ip, params.recId, hostSecret);
    if ("response" in auth) return auth.response;
    if (!isEmailConfigured()) {
      return NextResponse.json({ error: "Email isn't available right now." }, { status: 503 });
    }

    const byIp = await rateLimit(`recmail:ip:${ip}`, EMAIL_IP_LIMIT);
    if (!byIp.success) return tooManyRequestsResponse(byIp.reset);
    const byAddress = await rateLimit(`recmail:addr:${sha256(email.toLowerCase())}`, EMAIL_ADDRESS_LIMIT);
    if (!byAddress.success) return tooManyRequestsResponse(byAddress.reset);

    if (await hasEmailClaim(params.recId)) {
      return NextResponse.json({ error: "The link was already emailed for this recording." }, { status: 409 });
    }
    if (!(await savePendingEmail(params.recId, { email, hostSecret }))) {
      return NextResponse.json({ error: "An email is already queued for this recording." }, { status: 409 });
    }

    await reconcile(params.recId, auth.meta);
    const result = await maybeSendRecordingEmail(params.recId);
    return NextResponse.json({ status: result === "sent" ? "sent" : "queued" });
  } catch (error) {
    console.error("[recordings/email] dependency failure", error);
    return unavailableResponse();
  }
}
