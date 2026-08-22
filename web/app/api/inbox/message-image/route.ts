import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { getInboxMessageImageUrl, uploadInboxMessageImage, UploadValidationError } from "@/lib/storage";
import { recordPastedImageUpload } from "@/lib/pasted-images-server";
import { PastedImageOwnerType } from "@/lib/generated/prisma/enums";

/**
 * Clipboard paste-to-upload for an Inbox message body (§4.7) — same
 * rate-limited-per-user shape as /api/forums/post-image (a repeatable-abuse
 * surface unlike the app's other, deliberate file-picker image uploads).
 * The returned url is embedded as a `![](url)` token in the message body by
 * the client (lib/use-paste-image-upload.ts); linking it to the actual
 * sent message happens server-side in sendMessage via linkPastedImages, not
 * here.
 */
export async function POST(request: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const { success } = await rateLimit(`inbox-message-image:${user.id}`, { limit: 30, windowSeconds: 600 });
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
    key = await uploadInboxMessageImage(image);
  } catch (error) {
    if (error instanceof UploadValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  await recordPastedImageUpload({ key, uploaderId: user.id, ownerType: PastedImageOwnerType.inbox_message });

  return NextResponse.json({ url: getInboxMessageImageUrl(key) });
}
