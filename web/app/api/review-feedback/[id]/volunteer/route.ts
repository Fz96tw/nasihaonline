import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { ReviewItemError, offerToReview, withdrawVolunteerOffer } from "@/lib/review-server";
import { reviewVolunteerOfferSchema } from "@/lib/validation/review";

/**
 * POST /api/review-feedback/:id/volunteer — a member offers to review a
 * `seekingReviewers` item they weren't directly invited to (open-call
 * mode). Business rules (item must be seeking reviewers, can't volunteer
 * for your own item) are enforced inside offerToReview().
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const parsed = reviewVolunteerOfferSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await offerToReview(id, user.id, parsed.data.note);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ReviewItemError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

/** DELETE /api/review-feedback/:id/volunteer — the caller withdraws their own pending offer. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const { id } = await params;
  await withdrawVolunteerOffer(id, user.id);
  return NextResponse.json({ ok: true });
}
