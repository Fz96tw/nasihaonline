import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { EventError, updateEventInvitees } from "@/lib/events-server";

const updateInviteesSchema = z.object({
  addUserIds: z.array(z.string()).default([]),
  removeUserIds: z.array(z.string()).default([]),
});

/**
 * PATCH /api/events/:id/invitees — adds and/or removes members from a
 * restricted event's invited list after creation (Audience-Restricted
 * Group Events, Objective 03). Host or admin only, enforced inside
 * updateEventInvitees() — this route only checks the caller is signed in.
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
    const result = await updateEventInvitees(id, user, parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof EventError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
