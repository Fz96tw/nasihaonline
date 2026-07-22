import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { KnowledgeItemError, recordKnowledgeItemView } from "@/lib/library-server";

/**
 * POST /api/library/:id/view — records a unique visit for the eye-icon
 * count (§4.9), member-auth only (mirrors the events view route —
 * /library/[id] has no signed-out reader).
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
    const views = await recordKnowledgeItemView(params.id, user.id);
    return NextResponse.json({ views });
  } catch (error) {
    if (error instanceof KnowledgeItemError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
