import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireRole } from "@/lib/auth";
import { Role } from "@/lib/generated/prisma/enums";
import { moderationActionSchema } from "@/lib/validation/moderation";
import { PostError, resolvePostFlag } from "@/lib/blog-server";
import { KnowledgeItemError, resolveFlaggedKnowledgeItem } from "@/lib/library-server";
import { ForumError, resolveForumPostFlag } from "@/lib/forums-server";
import {
  enqueuePostIndexSync,
  enqueueKnowledgeItemIndexSync,
  enqueueForumThreadIndexSync,
} from "@/lib/queues/search-index-queue";

/**
 * PATCH /api/admin/content/:id — the one shared moderation-queue endpoint
 * (§4.11/§4.13) backing /admin/content: a single `{ type, action }` body
 * routes to whichever domain's resolve function actually owns the row,
 * matching "one shared queue, not a separate one per domain" at the API
 * level too, not just the UI. Gated to moderator OR admin, same scoping as
 * /admin/library/review-queue (not admin-only like most of /admin).
 */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireRole([Role.moderator, Role.admin]);
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const parsed = moderationActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    if (parsed.data.type === "blog_post") {
      const post = await resolvePostFlag(params.id, parsed.data.action);
      await enqueuePostIndexSync(post.id);
      return NextResponse.json({ item: post });
    }

    if (parsed.data.type === "library_item") {
      const item = await resolveFlaggedKnowledgeItem(params.id, parsed.data.action);
      await enqueueKnowledgeItemIndexSync(item.id);
      return NextResponse.json({ item });
    }

    const post = await resolveForumPostFlag(params.id, parsed.data.action);
    await enqueueForumThreadIndexSync(post.threadId);
    return NextResponse.json({ item: post });
  } catch (error) {
    if (error instanceof PostError || error instanceof KnowledgeItemError || error instanceof ForumError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
