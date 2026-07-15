import { NextResponse } from "next/server";
import { Readable } from "node:stream";
import { getAttachmentObject } from "@/lib/storage";

/**
 * Streams a blog post's hero image from MinIO through our own origin. Same
 * proxy rationale as app/api/team/photo/[...key]/route.ts — keeps MinIO off
 * the public internet and avoids handing browsers an environment-specific
 * presigned URL.
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
