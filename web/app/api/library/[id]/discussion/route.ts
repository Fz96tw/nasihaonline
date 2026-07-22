import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { KnowledgeItemError, startKnowledgeItemDiscussion } from "@/lib/library-server";

/**
 * POST /api/library/:id/discussion — "Start a Discussion" (§4.9), any
 * signed-in member. Idempotent (startKnowledgeItemDiscussion returns the
 * existing thread if one's already there), so a late click after another
 * visitor already started the discussion still resolves to the same
 * thread rather than erroring.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  try {
    const { threadId } = await startKnowledgeItemDiscussion(params.id, user.id);
    return NextResponse.json({ threadId });
  } catch (error) {
    if (error instanceof KnowledgeItemError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
