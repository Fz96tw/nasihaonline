import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { ReviewItemError, deleteReviewItem, updateReviewItem } from "@/lib/review-server";
import { updateReviewItemSchema } from "@/lib/validation/review";

/**
 * PATCH /api/review-feedback/:id — editing a submission (title/description/
 * type/level/categories/tags/urls/de-id flag, plus the file/link source).
 * Submitter-only (enforced in updateReviewItem). Multipart rather than JSON,
 * same reason as POST /api/review-feedback: an optional replacement file
 * travels alongside the text fields in one request.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const { id } = await params;
  const formData = await request.formData();
  const parsed = updateReviewItemSchema.safeParse({
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

  try {
    const item = await updateReviewItem(id, user, { ...parsed.data, file });
    return NextResponse.json(item);
  } catch (error) {
    if (error instanceof ReviewItemError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

/** DELETE /api/review-feedback/:id — submitter-only (enforced in deleteReviewItem). */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const { id } = await params;
  try {
    await deleteReviewItem(id, user);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ReviewItemError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
