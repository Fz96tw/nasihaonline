import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import {
  getContributionHistory,
  getContributionSummary,
  getPendingConfirmationsForCounterpart,
} from "@/lib/contributions-server";

export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const [summary, transactions, pendingConfirmations] = await Promise.all([
    getContributionSummary(user.id),
    getContributionHistory(user.id),
    getPendingConfirmationsForCounterpart(user.id),
  ]);

  return NextResponse.json(
    { summary, transactions, pendingConfirmations },
    { headers: { "cache-control": "no-store" } },
  );
}
