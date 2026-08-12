import { NextResponse } from "next/server";
import { Readable } from "node:stream";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getKnowledgeDocumentObject } from "@/lib/storage";
import { canViewReviewItem } from "@/lib/review-server";

/**
 * Streams a Peer Review submission's document from MinIO through our own
 * origin — same proxy rationale and documents/ bucket as
 * app/api/library/document/[...key]/route.ts, but gated by
 * canViewReviewItem (submitter/invitee/moderator/admin) instead of
 * KnowledgeItem's published/contributor check, since ReviewItemAttachment
 * is a separate table from KnowledgeAttachment and Peer Review has no
 * "published" visibility tier of its own.
 */
export async function GET(_request: Request, { params }: { params: { key: string[] } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const objectKey = params.key.join("/");
  const attachment = await db.reviewItemAttachment.findFirst({
    where: { objectKey },
    select: { reviewItem: { select: { submitterId: true, invitees: { select: { userId: true } } } } },
  });
  if (!attachment) {
    return new NextResponse(null, { status: 404 });
  }

  if (!canViewReviewItem(attachment.reviewItem, user)) {
    return new NextResponse(null, { status: 404 });
  }

  const object = await getKnowledgeDocumentObject(objectKey);
  if (!object) {
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(Readable.toWeb(object.stream as Readable) as ReadableStream, {
    headers: {
      "Content-Type": object.contentType,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
