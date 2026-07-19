import { NextResponse } from "next/server";
import { Readable } from "node:stream";
import { getAttachmentObject } from "@/lib/storage";

/**
 * Streams a Board Announcement's cover image from MinIO through our own
 * origin. Same proxy rationale as app/api/blog/hero/[...key]/route.ts —
 * shares the attachments/ bucket, just a different key prefix — and stays
 * unauthenticated so it can also be embedded in the announcement broadcast
 * email, where a recipient's mail client has no session to authenticate with.
 */
export async function GET(_request: Request, { params }: { params: { key: string[] } }) {
  const key = params.key.join("/");
  const object = await getAttachmentObject(key);
  if (!object) {
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(Readable.toWeb(object.stream as Readable) as ReadableStream, {
    headers: {
      "Content-Type": object.contentType,
      "Cache-Control": "public, max-age=3600, immutable",
    },
  });
}
