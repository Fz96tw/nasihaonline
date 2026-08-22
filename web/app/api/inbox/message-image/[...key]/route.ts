import { NextResponse } from "next/server";
import { Readable } from "node:stream";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAttachmentObject } from "@/lib/storage";
import { canViewPastedImage } from "@/lib/pasted-images-server";

/**
 * Streams a pasted Inbox message image from MinIO through our own origin,
 * gated by canViewPastedImage so a private 1:1 thread's image is never
 * visible to anyone but the sender/recipient — same shape as
 * app/api/forums/post-image/[...key]/route.ts. 404s (not 403) for a
 * missing or not-visible image.
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
  if (!image || image.ownerType !== "inbox_message") {
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
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
