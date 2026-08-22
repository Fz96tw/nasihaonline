import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { getLibraryBodyImageUrl, uploadLibraryBodyImage, UploadValidationError } from "@/lib/storage";
import { recordPastedImageUpload } from "@/lib/pasted-images-server";
import { PastedImageOwnerType } from "@/lib/generated/prisma/enums";

/**
 * Paste/drop-to-upload for a Library blog_post body's Tiptap editor (§4.9)
 * — same rate-limited-per-user shape as /api/forums/post-image and
 * /api/inbox/message-image. The returned url is inserted as a Tiptap image
 * node by the client (components/library/tiptap-editor.tsx); linking it to
 * the actual saved item happens server-side in createKnowledgeItem/
 * updateKnowledgeItem via linkPastedImages, not here.
 */
export async function POST(request: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const { success } = await rateLimit(`library-body-image:${user.id}`, { limit: 30, windowSeconds: 600 });
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
    key = await uploadLibraryBodyImage(image);
  } catch (error) {
    if (error instanceof UploadValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  await recordPastedImageUpload({ key, uploaderId: user.id, ownerType: PastedImageOwnerType.library_item });

  return NextResponse.json({ url: getLibraryBodyImageUrl(key) });
}
