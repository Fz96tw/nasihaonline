import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireRole } from "@/lib/auth";
import { Role } from "@/lib/generated/prisma/enums";
import { getPendingAdminReviewCount } from "@/lib/admin-review-server";

/** GET /api/admin/pending-review-count — total pending items across /admin sections, polled by the nav shield icon. */
export async function GET() {
  try {
    await requireRole([Role.admin]);
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const count = await getPendingAdminReviewCount();
  return NextResponse.json({ count });
}
