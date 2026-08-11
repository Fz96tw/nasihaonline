import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { ReviewItemError, respondToVolunteerOffer } from "@/lib/review-server";

const respondSchema = z.object({ action: z.enum(["accept", "decline"]) });

/**
 * PATCH /api/review-feedback/:id/volunteer-offers/:offerId — the item's
 * submitter accepts or declines a pending volunteer offer. Submitter-only
 * (enforced inside respondToVolunteerOffer via assertSubmitter) — this
 * route only checks the caller is signed in, same split as
 * PATCH /api/library/:id/invitees.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; offerId: string }> }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const { offerId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = respondSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await respondToVolunteerOffer(offerId, user, parsed.data.action);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ReviewItemError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
