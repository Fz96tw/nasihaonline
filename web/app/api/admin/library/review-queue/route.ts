import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireRole } from "@/lib/auth";
import { Role } from "@/lib/generated/prisma/enums";
import { getReviewQueue } from "@/lib/library-server";

/**
 * GET /api/admin/library/review-queue (§4.9) — Library Steward pre-publish
 * queue. Gated to moderator or admin (Stewards are moderators, §2.1), unlike
 * most /api/admin/* routes which are admin-only — mirrors §11's "any
 * moderator can act on any domain" v1 scoping decision.
 */
export async function GET() {
  try {
    await requireRole([Role.moderator, Role.admin]);
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const items = await getReviewQueue();
  return NextResponse.json({ items });
}
