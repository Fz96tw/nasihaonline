import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { PostError, updatePost } from "@/lib/blog-server";
import { updatePostSchema } from "@/lib/validation/post";
import { enqueuePostIndexSync } from "@/lib/queues/search-index-queue";

/**
 * PATCH /api/blog/[slug] — editing a published post (§4.8, §11.12), author
 * or admin only (enforced in updatePost). Multipart like POST /api/blog,
 * for the same reason: an optional replacement hero image travels alongside
 * the text fields in one request.
 */
export async function PATCH(request: Request, { params }: { params: { slug: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const formData = await request.formData();
  const parsed = updatePostSchema.safeParse({
    title: formData.get("title"),
    body: formData.get("body"),
    categoryId: formData.get("categoryId"),
    tagIds: formData.getAll("tagIds"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const heroImageField = formData.get("heroImage");
  const heroImage = heroImageField instanceof File && heroImageField.size > 0 ? heroImageField : null;

  try {
    const post = await updatePost(params.slug, user, { ...parsed.data, heroImage });
    await enqueuePostIndexSync(post.id);
    return NextResponse.json({ slug: post.slug });
  } catch (error) {
    if (error instanceof PostError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
