import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { ReviewItemError, deleteReviewItem, updateReviewItem } from "@/lib/review-server";
import { updateReviewItemSchema } from "@/lib/validation/review";

/**
 * PATCH /api/review-feedback/:id — editing a submission's metadata
 * (title/description/type/level/categories/tags/urls/de-id flag).
 * Submitter-only (enforced in updateReviewItem). JSON body, unlike
 * POST /api/review-feedback — editing never replaces the underlying
 * attachment/hero image, only the surrounding fields, so there's no file
 * to carry in a multipart body.
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
  const body = await request.json().catch(() => null);
  const parsed = updateReviewItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const item = await updateReviewItem(id, user, parsed.data);
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
