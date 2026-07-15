import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { PostError, createPost } from "@/lib/blog-server";
import { createPostSchema } from "@/lib/validation/post";
import { enqueuePostIndexSync } from "@/lib/queues/search-index-queue";

/**
 * POST /api/blog — "Write a Post" (§4.8), member-auth only (no tier gate,
 * unlike Submit Event). Multipart rather than JSON since the hero image
 * upload and the post fields are submitted as one action — see
 * lib/storage.ts's uploadPostHeroImage for the image validation/storage
 * step this delegates to via createPost.
 */
export async function POST(request: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const formData = await request.formData();
  const parsed = createPostSchema.safeParse({
    title: formData.get("title"),
    body: formData.get("body"),
    categoryId: formData.get("categoryId"),
    tagIds: formData.getAll("tagIds"),
    licenseConsented: formData.get("licenseConsented") === "true",
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const heroImageField = formData.get("heroImage");
  const heroImage = heroImageField instanceof File && heroImageField.size > 0 ? heroImageField : null;

  try {
    const post = await createPost(user.id, { ...parsed.data, heroImage });
    await enqueuePostIndexSync(post.id);
    return NextResponse.json({ slug: post.slug }, { status: 201 });
  } catch (error) {
    if (error instanceof PostError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
