import { NextResponse } from "next/server";
import { Readable } from "node:stream";
import { getTeamPhotoObject } from "@/lib/storage";

/**
 * Streams a team photo from MinIO through our own origin. See the comment
 * on getSignedPhotoUrl (lib/storage.ts) for why this proxy exists instead
 * of handing browsers a MinIO presigned URL directly.
 */
export async function GET(_request: Request, { params }: { params: { key: string[] } }) {
  const key = params.key.join("/");
  const object = await getTeamPhotoObject(key);
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
