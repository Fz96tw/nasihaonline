import { NextResponse } from "next/server";
import { Readable } from "node:stream";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAttachmentObject } from "@/lib/storage";
import { canViewPastedImage } from "@/lib/pasted-images-server";

/**
 * Streams a pasted Forum post/reply image from MinIO through our own
 * origin (same proxy rationale as app/api/library/document/[...key]/
 * route.ts), gated by canViewPastedImage so a restricted thread's pasted
 * image is never more visible than the thread itself. 404s (not 403) for
 * a missing or not-visible image — same "don't confirm existence"
 * convention as the rest of the app's restricted-content read paths.
 */
export async function GET(_request: Request, { params }: { params: { key: string[] } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const key = params.key.join("/");
  const image = await db.pastedImage.findUnique({
    where: { key },
    select: { uploaderId: true, ownerType: true, forumPostId: true, inboxMessageId: true, knowledgeItemId: true },
  });
  if (!image || image.ownerType !== "forum_post") {
    return new NextResponse(null, { status: 404 });
  }
  if (!(await canViewPastedImage(image, user))) {
    return new NextResponse(null, { status: 404 });
  }

  const object = await getAttachmentObject(key);
  if (!object) {
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(Readable.toWeb(object.stream as Readable) as ReadableStream, {
    headers: {
      "Content-Type": object.contentType,
      // Access-gated per request (unlike public hero/avatar images), so
      // this must stay out of shared/CDN caches — private only. Each key
      // is a random UUID with immutable content, so a long private-cache
      // lifetime is safe.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
