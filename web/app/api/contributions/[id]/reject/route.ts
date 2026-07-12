import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { ContributionResolutionError, resolveContribution } from "@/lib/contributions-server";
import { LedgerStatus } from "@/lib/generated/prisma/enums";

/**
 * Peer or admin rejection of a pending contribution (§4.4). The entry stays
 * in the audit trail permanently but contributes 0 to balance — enforced by
 * getContributionSummary() only summing `confirmed` rows. Body is optional
 * (peer rejections send none); when a `reason` is present it's passed
 * through — resolveContribution() enforces it's required for an admin
 * rejecting in their admin capacity.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const body = await request.json().catch(() => null);
  const reason = typeof body?.reason === "string" ? body.reason : undefined;

  try {
    const entry = await resolveContribution(params.id, user, LedgerStatus.rejected, reason);
    return NextResponse.json({ id: entry.id, status: entry.status });
  } catch (error) {
    if (error instanceof ContributionResolutionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
