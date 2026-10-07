import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireRole } from "@/lib/auth";
import { Role } from "@/lib/generated/prisma/enums";
import { regenerateWeeklyDigestNow } from "@/lib/weekly-digest-job";

/**
 * POST /api/admin/weekly-digest/regenerate — admin-only. Replaces the current
 * period's digest with a fresh one (a draft is deleted, a published digest is
 * retracted). 409 if a digest for a later period exists; a quiet period
 * changes nothing.
 */
export async function POST() {
  let user;
  try {
    user = await requireRole([Role.admin]);
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const result = await regenerateWeeklyDigestNow(user.id);
  if (result.status === "blocked") {
    return NextResponse.json({ error: "A digest for a later period already exists.", ...result }, { status: 409 });
  }
  return NextResponse.json(result);
}
