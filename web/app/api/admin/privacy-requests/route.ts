import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireRole } from "@/lib/auth";
import { Role } from "@/lib/generated/prisma/enums";
import { PrivacyError, fulfillPrivacyDataRequest, getOpenPrivacyRequests } from "@/lib/privacy-server";
import { fulfillPrivacyRequestSchema } from "@/lib/validation/privacy";

/**
 * GET /api/admin/privacy-requests — open (pending) requests backing
 * /admin/privacy-requests, each flagged with whether the member has
 * ContributionLedger/content history that must be retained under §4.4's
 * immutability rule even if the request is a deletion.
 */
export async function GET() {
  try {
    await requireRole([Role.admin]);
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const requests = await getOpenPrivacyRequests();
  return NextResponse.json({ requests });
}

/**
 * PATCH /api/admin/privacy-requests — marks a pending request fulfilled
 * (fulfilledAt/handledBy recorded). The actual export-file generation or
 * deletion/anonymization is a manual, offline admin action (§4.15) — this
 * only records that it happened.
 */
export async function PATCH(request: Request) {
  let admin;
  try {
    admin = await requireRole([Role.admin]);
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const parsed = fulfillPrivacyRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const privacyRequest = await fulfillPrivacyDataRequest(parsed.data.id, admin.id);
    return NextResponse.json({ privacyRequest });
  } catch (error) {
    if (error instanceof PrivacyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
