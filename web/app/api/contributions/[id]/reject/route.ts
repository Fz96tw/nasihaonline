import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { ContributionResolutionError, resolveContribution } from "@/lib/contributions-server";
import { LedgerStatus } from "@/lib/generated/prisma/enums";

/**
 * Peer or admin rejection of a pending contribution (§4.4). The entry stays
 * in the audit trail permanently but contributes 0 to balance — enforced by
 * getContributionSummary() only summing `confirmed` rows.
 */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  try {
    const entry = await resolveContribution(params.id, user, LedgerStatus.rejected);
    return NextResponse.json({ id: entry.id, status: entry.status });
  } catch (error) {
    if (error instanceof ContributionResolutionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
