import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { KnowledgeItemError, createKnowledgeItem } from "@/lib/library-server";
import { createKnowledgeItemSchema } from "@/lib/validation/knowledge";

/**
 * POST /api/library — "Submit Resource" (§4.9), member-auth only (no tier
 * gate, same as POST /api/blog). Multipart rather than JSON since the
 * optional document upload and the item's fields are submitted as one
 * action — see lib/storage.ts's uploadKnowledgeDocument for the file
 * validation/storage step this delegates to via createKnowledgeItem.
 */
export async function POST(request: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const formData = await request.formData();
  const parsed = createKnowledgeItemSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    contentType: formData.get("contentType"),
    level: formData.get("level"),
    categoryId: formData.get("categoryId"),
    tagIds: formData.getAll("tagIds"),
    youtubeUrl: formData.get("youtubeUrl") || null,
    deidentificationConfirmed: formData.get("deidentificationConfirmed") === "true",
    licenseConsented: formData.get("licenseConsented") === "true",
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const fileField = formData.get("file");
  const file = fileField instanceof File && fileField.size > 0 ? fileField : null;

  try {
    const item = await createKnowledgeItem(user.id, { ...parsed.data, file });
    return NextResponse.json({ id: item.id }, { status: 201 });
  } catch (error) {
    if (error instanceof KnowledgeItemError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
