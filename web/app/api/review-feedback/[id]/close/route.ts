import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { ReviewItemError, closeReviewItem, reopenReviewItem } from "@/lib/review-server";
import { enqueueReviewItemIndexSync } from "@/lib/queues/search-index-queue";

/** POST /api/review-feedback/:id/close — submitter-only "Close Review" action. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const { id } = await params;
  try {
    const result = await closeReviewItem(id, user);
    await enqueueReviewItemIndexSync(id);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ReviewItemError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

/** DELETE /api/review-feedback/:id/close — submitter-only "Reopen" action (undoes a close). */
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
    const result = await reopenReviewItem(id, user);
    await enqueueReviewItemIndexSync(id);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ReviewItemError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
