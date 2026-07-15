import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireRole } from "@/lib/auth";
import { Role } from "@/lib/generated/prisma/enums";
import { KnowledgeItemError, reviewKnowledgeItem } from "@/lib/library-server";
import { knowledgeReviewActionSchema } from "@/lib/validation/knowledge-review";
import { enqueueKnowledgeItemIndexSync } from "@/lib/queues/search-index-queue";

/**
 * POST /api/admin/library/:id/publish (§4.9) — Steward/admin publish-or-
 * reject action, same moderator-or-admin gate as GET review-queue.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireRole([Role.moderator, Role.admin]);
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const parsed = knowledgeReviewActionSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const item = await reviewKnowledgeItem(params.id, parsed.data.action);
    await enqueueKnowledgeItemIndexSync(item.id);
    return NextResponse.json({ item });
  } catch (error) {
    if (error instanceof KnowledgeItemError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
