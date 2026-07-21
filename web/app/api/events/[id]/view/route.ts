import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { EventError, recordEventView } from "@/lib/events-server";

/**
 * POST /api/events/:id/view — records a unique visit for the eye-icon
 * count (§4.6), member-auth only (mirrors the forums thread view route —
 * /calendar/[eventId] has no signed-out reader).
 */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  try {
    const views = await recordEventView(params.id, user.id);
    return NextResponse.json({ views });
  } catch (error) {
    if (error instanceof EventError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
