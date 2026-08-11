import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { ReviewItemError, updateReviewItemInvitees } from "@/lib/review-server";

const updateInviteesSchema = z.object({
  addUserIds: z.array(z.string()).default([]),
  removeUserIds: z.array(z.string()).default([]),
});

/**
 * PATCH /api/review-feedback/:id/invitees — adds and/or removes reviewers
 * after submission. Submitter-only, enforced inside
 * updateReviewItemInvitees() — mirrors PATCH /api/library/:id/invitees.
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
  const parsed = updateInviteesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await updateReviewItemInvitees(id, user, parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ReviewItemError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
