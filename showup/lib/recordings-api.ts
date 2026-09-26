import "server-only";
import { NextResponse } from "next/server";
import { isRateLimited, rateLimit } from "@/lib/rate-limit";
import { getMeta, secretMatches, type RecordingMeta } from "@/lib/recordings";
import { tooManyRequestsResponse } from "@/lib/rooms-api";

/** Only failed attempts spend this budget, so a host reloading their own page is never limited. */
const BAD_SECRET_LIMIT = { limit: 20, windowSeconds: 60 * 60 };

const NOT_FOUND = () => NextResponse.json({ error: "Recording not found." }, { status: 404 });

/**
 * Authorizes access to one recording by recId + hostSecret. An unknown recId
 * and a wrong secret get the identical answer, so neither reveals whether a
 * recording exists. Repeated failures from one IP get 429.
 */
export async function authorizeRecording(
  ip: string,
  recId: string,
  secret: string | null | undefined,
): Promise<{ meta: RecordingMeta } | { response: NextResponse }> {
  const key = `recfail:ip:${ip}`;
  if (await isRateLimited(key, BAD_SECRET_LIMIT.limit)) return { response: tooManyRequestsResponse() };
  const meta = await getMeta(recId);
  if (!meta || !secretMatches(meta, secret)) {
    await rateLimit(key, BAD_SECRET_LIMIT);
    return { response: NOT_FOUND() };
  }
  return { meta };
}
