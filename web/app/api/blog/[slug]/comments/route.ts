import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { getPublishedPostBySlug, PostCommentError, createPostComment } from "@/lib/blog-server";
import { createCommentSchema } from "@/lib/validation/post-comment";

/**
 * POST /api/blog/[slug]/comments — "Threaded comments on published posts"
 * (§4.8). Member-auth only; the route resolves the slug to a *published*
 * post (404 for drafts/unknown slugs, same "don't leak a draft's existence"
 * rule as the page itself) before delegating to createPostComment.
 */
export async function POST(request: Request, { params }: { params: { slug: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const post = await getPublishedPostBySlug(params.slug);
  if (!post) {
    return NextResponse.json({ error: "Post not found." }, { status: 404 });
  }

  const parsed = createCommentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const comment = await createPostComment(post.id, user.id, parsed.data);
    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    if (error instanceof PostCommentError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
