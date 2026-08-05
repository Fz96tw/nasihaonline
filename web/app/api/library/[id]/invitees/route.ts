import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { KnowledgeItemError, updateKnowledgeItemInvitees } from "@/lib/library-server";

const updateInviteesSchema = z.object({
  addUserIds: z.array(z.string()).default([]),
  removeUserIds: z.array(z.string()).default([]),
});

/**
 * PATCH /api/library/:id/invitees — adds and/or removes members from a
 * restricted Knowledge Library item's invited list after submission
 * (Restricted Knowledge Library Submissions, Objective 05). Contributor or
 * Library Steward/admin only, enforced inside updateKnowledgeItemInvitees()
 * — this route only checks the caller is signed in.
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
    const result = await updateKnowledgeItemInvitees(id, user, parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof KnowledgeItemError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
