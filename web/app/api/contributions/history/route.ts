import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { getContributionHistory, getContributionSummary } from "@/lib/contributions-server";

export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const [summary, transactions] = await Promise.all([
    getContributionSummary(user.id),
    getContributionHistory(user.id),
  ]);

  return NextResponse.json(
    { summary, transactions },
    { headers: { "cache-control": "no-store" } },
  );
}
