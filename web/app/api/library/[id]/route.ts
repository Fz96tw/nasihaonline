import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { KnowledgeItemError, updateKnowledgeItem } from "@/lib/library-server";
import { updateKnowledgeItemSchema } from "@/lib/validation/knowledge";
import { enqueueKnowledgeItemIndexSync } from "@/lib/queues/search-index-queue";

/**
 * PATCH /api/library/:id — editing a submission (§4.9), contributor / Library
 * Steward / admin only (enforced in updateKnowledgeItem). Multipart rather
 * than JSON, same reason as POST /api/library: an optional replacement file
 * travels alongside the text fields in one request.
 */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const formData = await request.formData();
  const parsed = updateKnowledgeItemSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    contentType: formData.get("contentType"),
    level: formData.get("level"),
    categoryIds: formData.getAll("categoryIds"),
    tagIds: formData.getAll("tagIds"),
    youtubeUrl: formData.get("youtubeUrl") || null,
    externalUrl: formData.get("externalUrl") || null,
    deidentificationConfirmed: formData.get("deidentificationConfirmed") === "true",
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const fileField = formData.get("file");
  const file = fileField instanceof File && fileField.size > 0 ? fileField : null;
  const heroImageField = formData.get("heroImage");
  const heroImage = heroImageField instanceof File && heroImageField.size > 0 ? heroImageField : null;

  try {
    const item = await updateKnowledgeItem(params.id, user, { ...parsed.data, file, heroImage });
    await enqueueKnowledgeItemIndexSync(item.id);
    return NextResponse.json({ id: item.id });
  } catch (error) {
    if (error instanceof KnowledgeItemError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
