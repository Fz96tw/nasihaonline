import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { EventError, startEventDiscussion } from "@/lib/events-server";

/**
 * POST /api/events/:id/discussion — "Start a Discussion" (mirrors
 * POST /api/library/:id/discussion, §4.9), any signed-in member who can
 * see the event (community, or the event's host/an invitee — enforced
 * inside startEventDiscussion, not here). Idempotent, so a late click
 * after someone else already started it resolves to the same thread
 * rather than erroring.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const { id } = await params;

  try {
    const { threadId } = await startEventDiscussion(id, user.id);
    return NextResponse.json({ threadId });
  } catch (error) {
    if (error instanceof EventError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
