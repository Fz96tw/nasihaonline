import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { createQuickRecordingMeetingRequest, getReadyQuickRecordingsForUser } from "@/lib/quick-recordings-server";

const postSchema = z.object({ topic: z.string().trim().max(200).optional() });

/** GET /api/quick-recordings — the current user's own ready quick recordings, newest first (video-library picker). */
export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const recordings = await getReadyQuickRecordingsForUser(user.id);
  return NextResponse.json({ recordings });
}

/**
 * POST /api/quick-recordings — one-click entry point (Dashboard/Forums
 * "Record a quick video" buttons). No naming prompt: an empty/missing
 * `topic` gets an auto-generated name (see createQuickRecordingMeetingRequest).
 */
export async function POST(request: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const parsed = postSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const meetingRequest = await createQuickRecordingMeetingRequest(user.id, parsed.data.topic);
  return NextResponse.json({ id: meetingRequest.id });
}
