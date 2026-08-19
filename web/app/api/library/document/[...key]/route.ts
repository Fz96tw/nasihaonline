import { NextResponse } from "next/server";
import { Readable } from "node:stream";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getKnowledgeDocumentObject } from "@/lib/storage";
import { KnowledgeStatus } from "@/lib/generated/prisma/enums";

/**
 * Streams a Knowledge Library document from MinIO through our own origin —
 * same proxy rationale as app/api/blog/hero/[...key]/route.ts. Unlike the
 * blog hero proxy (public images on a public route), /library is member-only
 * (§4.9's IA) and a pending_review item's attachment must stay invisible to
 * anyone but its contributor and Stewards/admins until published — so this
 * checks the owning KnowledgeItem's status/contributor, not just whether the
 * object exists.
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
  const attachment = await db.knowledgeAttachment.findFirst({
    where: { objectKey },
    select: { fileName: true, knowledgeItem: { select: { status: true, contributorId: true } } },
  });
  if (!attachment) {
    return new NextResponse(null, { status: 404 });
  }

  const { status, contributorId } = attachment.knowledgeItem;
  const canView =
    status === KnowledgeStatus.published ||
    status === KnowledgeStatus.flagged ||
    contributorId === user.id ||
    user.role === "moderator" ||
    user.role === "admin";
  if (!canView) {
    return new NextResponse(null, { status: 404 });
  }

  const object = await getKnowledgeDocumentObject(objectKey);
  if (!object) {
    return new NextResponse(null, { status: 404 });
  }

  // The stored Content-Type is the uploader's browser-supplied file.type
  // (§storage.ts uploadKnowledgeDocument) — untrusted. Forcing a download
  // instead of an inline render, plus nosniff, keeps a malicious upload
  // (e.g. an HTML file) from executing same-origin when this URL is opened
  // directly rather than viewed through the in-app preview. Images are
  // exempted: components/library/resource-preview.tsx's ImagePreview loads
  // this same URL via a plain <img src>, and Chrome/Firefox refuse to paint
  // an <img> whose response carries Content-Disposition: attachment — it's
  // treated as a download instead, breaking the in-app preview. That's safe
  // to skip only because uploadKnowledgeDocument's MIME allowlist already
  // limits image/* uploads to raster formats (jpeg/png/webp/gif/bmp), none
  // of which execute script when painted into an <img>.
  const headers: Record<string, string> = {
    "Content-Type": object.contentType,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, max-age=3600",
  };
  if (!object.contentType.startsWith("image/")) {
    const asciiFallbackName = attachment.fileName.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
    headers["Content-Disposition"] =
      `attachment; filename="${asciiFallbackName}"; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`;
  }

  return new NextResponse(Readable.toWeb(object.stream as Readable) as ReadableStream, { headers });
}
