import { NextResponse } from "next/server";
import { Readable } from "node:stream";
import { getAttachmentObject } from "@/lib/storage";

/**
 * Streams a meeting waiting-room organizer message image from MinIO
 * through our own origin — same proxy rationale as
 * app/api/events/hero/[...key]/route.ts.
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
