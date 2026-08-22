import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { getForumPostImageUrl, uploadForumPostImage, UploadValidationError } from "@/lib/storage";
import { recordPastedImageUpload } from "@/lib/pasted-images-server";
import { PastedImageOwnerType } from "@/lib/generated/prisma/enums";

/**
 * Clipboard paste-to-upload for a Forum post/reply body (§4.13) — a
 * repeatable-abuse surface unlike the app's other (deliberate file-picker)
 * image uploads, so this is rate-limited per user. The returned url is
 * embedded as a `![](url)` token in the post body by the client
 * (lib/use-paste-image-upload.ts); linking it to the actual saved post
 * happens server-side in createForumPost/updateForumPost via
 * linkPastedImages, not here.
 */
export async function POST(request: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const { success } = await rateLimit(`forum-post-image:${user.id}`, { limit: 30, windowSeconds: 600 });
  if (!success) {
    return NextResponse.json({ error: "Too many image uploads. Please try again in a few minutes." }, { status: 429 });
  }

  const formData = await request.formData();
  const image = formData.get("image");
  if (!(image instanceof File) || image.size === 0) {
    return NextResponse.json({ error: "No image provided" }, { status: 400 });
  }

  let key: string;
  try {
    key = await uploadForumPostImage(image);
  } catch (error) {
    if (error instanceof UploadValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  await recordPastedImageUpload({ key, uploaderId: user.id, ownerType: PastedImageOwnerType.forum_post });

  return NextResponse.json({ url: getForumPostImageUrl(key) });
}
