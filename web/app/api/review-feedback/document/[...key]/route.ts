import { NextResponse } from "next/server";
import { Readable } from "node:stream";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getKnowledgeDocumentObject, getKnowledgeDocumentObjectRange } from "@/lib/storage";
import { parseByteRange } from "@/lib/http-range";
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
export async function GET(request: Request, { params }: { params: { key: string[] } }) {
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

  // Range support so a <video> can seek; the full-object path also advertises it.
  const range = parseByteRange(request.headers.get("range"), object.size);
  if (range === "unsatisfiable") {
    (object.stream as Readable).destroy();
    return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${object.size}` } });
  }
  const headers: Record<string, string> = {
    "Content-Type": object.contentType,
    "Cache-Control": "private, max-age=3600",
    "Accept-Ranges": "bytes",
  };
  if (range) {
    (object.stream as Readable).destroy();
    const partial = await getKnowledgeDocumentObjectRange(objectKey, range.start, range.end);
    if (!partial) return new NextResponse(null, { status: 404 });
    headers["Content-Range"] = `bytes ${range.start}-${range.end}/${object.size}`;
    headers["Content-Length"] = String(range.end - range.start + 1);
    return new NextResponse(Readable.toWeb(partial as Readable) as ReadableStream, { status: 206, headers });
  }
  headers["Content-Length"] = String(object.size);
  return new NextResponse(Readable.toWeb(object.stream as Readable) as ReadableStream, { headers });
}
