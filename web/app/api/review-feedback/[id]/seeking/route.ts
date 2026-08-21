import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { ReviewItemError, toggleSeekingReviewers } from "@/lib/review-server";
import { enqueueReviewItemIndexSync } from "@/lib/queues/search-index-queue";

const toggleSchema = z.object({ value: z.boolean() });

/**
 * PATCH /api/review-feedback/:id/seeking — submitter-only toggle for
 * whether an item is currently open to volunteer offers, independent of
 * status (open/closed). Lets a submitter stop new offers once they have
 * enough reviewers, or open a call later on an item that started as
 * "Select Reviewers."
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
  const parsed = toggleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await toggleSeekingReviewers(id, user, parsed.data.value);
    await enqueueReviewItemIndexSync(id);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ReviewItemError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
