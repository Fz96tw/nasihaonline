import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { KnowledgeItemError, flagKnowledgeItem } from "@/lib/library-server";
import { enqueueKnowledgeItemIndexSync } from "@/lib/queues/search-index-queue";
import { flagContentSchema } from "@/lib/validation/flag";

/**
 * POST /api/library/:id/flag — community flagging (§4.9), member-auth only.
 * Any member (including the item's own contributor) can flag a published
 * item as inaccurate/outdated; it stays visible on /library and in search
 * (see flagKnowledgeItem/syncKnowledgeItemToIndex) but is now marked
 * flagged for a Steward to review.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const parsed = flagContentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const item = await flagKnowledgeItem(params.id, parsed.data.reason);
    await enqueueKnowledgeItemIndexSync(item.id);
    return NextResponse.json({ item });
  } catch (error) {
    if (error instanceof KnowledgeItemError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
