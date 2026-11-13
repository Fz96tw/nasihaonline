import { NextResponse } from "next/server";
import { z } from "zod";
import { removeCuratedArticleImage, replaceCuratedArticleImage } from "@/lib/curated-articles-server";
import { parseCuratedBody, withCuratedAdmin } from "@/lib/curated-articles-route";

const imageLinkSchema = z.object({ url: z.string().trim().url("Enter the image's full http(s) link.").max(2000) });

/**
 * POST /api/admin/curated-articles/articles/:id/image — replace the article's
 * image: a multipart `file` upload, or JSON `{ url }` for an image link. The
 * new image is resized and cached like fetched ones.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  return withCuratedAdmin(async (admin) => {
    if ((request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const form = await request.formData().catch(() => null);
      const file = form?.get("file");
      if (!(file instanceof File) || file.size === 0) {
        return NextResponse.json({ error: "Choose an image file to upload." }, { status: 400 });
      }
      if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "Images can be at most 5MB." }, { status: 400 });
      const article = await replaceCuratedArticleImage(params.id, admin.id, { upload: Buffer.from(await file.arrayBuffer()) });
      return NextResponse.json({ article });
    }
    const body = await parseCuratedBody(request, imageLinkSchema);
    if ("response" in body) return body.response;
    const article = await replaceCuratedArticleImage(params.id, admin.id, { url: body.data.url });
    return NextResponse.json({ article });
  });
}

/** DELETE /api/admin/curated-articles/articles/:id/image — remove it; the article shows the placeholder. */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  return withCuratedAdmin(async (admin) => {
    const article = await removeCuratedArticleImage(params.id, admin.id);
    return NextResponse.json({ article });
  });
}
