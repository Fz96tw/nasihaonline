import { NextResponse } from "next/server";
import { deleteArticleSource, setArticleSourceEnabled, updateArticleSource } from "@/lib/curated-articles-server";
import { articleSourcePatchSchema, articleSourceSchema } from "@/lib/validation/curated-articles";
import { parseCuratedBody, withCuratedAdmin } from "@/lib/curated-articles-route";

type Params = { params: { id: string } };

/** PUT /api/admin/curated-articles/sources/:id — replace a source's settings. */
export async function PUT(request: Request, { params }: Params) {
  return withCuratedAdmin(async (admin) => {
    const body = await parseCuratedBody(request, articleSourceSchema);
    if ("response" in body) return body.response;
    await updateArticleSource(params.id, admin.id, body.data);
    return NextResponse.json({ ok: true });
  });
}

/** PATCH /api/admin/curated-articles/sources/:id — enable/disable only. */
export async function PATCH(request: Request, { params }: Params) {
  return withCuratedAdmin(async (admin) => {
    const body = await parseCuratedBody(request, articleSourcePatchSchema);
    if ("response" in body) return body.response;
    await setArticleSourceEnabled(params.id, admin.id, body.data.enabled);
    return NextResponse.json({ ok: true });
  });
}

/** DELETE /api/admin/curated-articles/sources/:id — its existing articles are kept. */
export async function DELETE(_request: Request, { params }: Params) {
  return withCuratedAdmin(async (admin) => {
    await deleteArticleSource(params.id, admin.id);
    return NextResponse.json({ ok: true });
  });
}
