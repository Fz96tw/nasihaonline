import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { getPublishedPostBySlug, PostError, flagPost } from "@/lib/blog-server";

/**
 * POST /api/blog/[slug]/flag — community flagging (§4.8), member-auth only.
 * Resolves the slug to a *published* post first (404 for drafts/unknown
 * slugs), same "don't leak a draft's existence" rule as the comments route.
 */
export async function POST(_request: Request, { params }: { params: { slug: string } }) {
  try {
    await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const post = await getPublishedPostBySlug(params.slug);
  if (!post) {
    return NextResponse.json({ error: "Post not found." }, { status: 404 });
  }

  try {
    const updated = await flagPost(post.id);
    return NextResponse.json({ post: updated });
  } catch (error) {
    if (error instanceof PostError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
