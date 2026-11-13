import { NextResponse } from "next/server";
import { Readable } from "node:stream";
import { getAttachmentObject } from "@/lib/storage";
import { CURATED_ARTICLE_IMAGE_PREFIX } from "@/lib/curated-articles";

/**
 * Streams a curated article's cached thumbnail from MinIO through our own
 * origin — same proxy shape as app/api/announcements/hero. Only the
 * curated-article/ prefix is served here. Unauthenticated, like the other
 * hero-image proxies: the image is a copy of a public article's own preview.
 */
export async function GET(_request: Request, { params }: { params: { key: string[] } }) {
  const key = params.key.join("/");
  if (!key.startsWith(CURATED_ARTICLE_IMAGE_PREFIX) || key.includes("..")) {
    return new NextResponse(null, { status: 404 });
  }
  const object = await getAttachmentObject(key);
  if (!object) return new NextResponse(null, { status: 404 });
  return new NextResponse(Readable.toWeb(object.stream as Readable) as ReadableStream, {
    headers: { "Content-Type": object.contentType, "Cache-Control": "public, max-age=86400, immutable" },
  });
}
