import { NextResponse } from "next/server";
import { z } from "zod";
import { codeDigest, normalizeCode } from "@/lib/room-code";
import { clientIp, isRateLimited, rateLimit } from "@/lib/rate-limit";
import { describeRecording, getMeta, passcodeMatches, reconcile, recordingIdsForCode } from "@/lib/recordings";
import { isSameOrigin } from "@/lib/same-origin";
import { tooManyRequestsResponse, unavailableResponse } from "@/lib/rooms-api";

export const dynamic = "force-dynamic";

const schema = z.object({ code: z.string().transform(normalizeCode), passcode: z.string().min(1).max(100) });

const LOOKUP_IP_LIMIT = { limit: 30, windowSeconds: 60 * 60 };
/** Wrong guesses only. Per code, so guessing one meeting's passcode is throttled no matter how many IPs are used; per IP, so one client can't sweep many codes. */
const BAD_PER_CODE = { limit: 5, windowSeconds: 60 * 60 };
const BAD_PER_IP = { limit: 10, windowSeconds: 60 * 60 };

const NOT_FOUND = "No recording found for that code and passcode.";

/**
 * Recovery when the saved link is lost: the host's code plus the passcode shown
 * at the start of the meeting. Codes get reused by different hosts, so the
 * code's index can hold several recordings; only those whose passcode hash
 * matches are returned, and a different host reusing the code never matches.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter the code and passcode." }, { status: 400 });
  const { code, passcode } = parsed.data;

  const ip = clientIp(request);
  const digest = codeDigest(code);
  const badCode = `reclookup:code:${digest}`;
  const badIp = `reclookup:ip:${ip}`;

  try {
    if ((await isRateLimited(badCode, BAD_PER_CODE.limit)) || (await isRateLimited(badIp, BAD_PER_IP.limit))) {
      return tooManyRequestsResponse();
    }
    const overall = await rateLimit(`reclookup:all:${ip}`, LOOKUP_IP_LIMIT);
    if (!overall.success) return tooManyRequestsResponse(overall.reset);

    const recordings = [];
    for (const recId of await recordingIdsForCode(digest)) {
      const meta = await getMeta(recId);
      if (!meta || !passcodeMatches(meta, passcode)) continue;
      await reconcile(recId, meta);
      recordings.push(await describeRecording(meta));
    }
    if (recordings.length === 0) {
      await Promise.all([rateLimit(badCode, BAD_PER_CODE), rateLimit(badIp, BAD_PER_IP)]);
      return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
    }
    return NextResponse.json({ recordings });
  } catch (error) {
    console.error("[recordings/lookup] dependency failure", error);
    return unavailableResponse();
  }
}
