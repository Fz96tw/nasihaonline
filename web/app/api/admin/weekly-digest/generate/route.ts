import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireRole } from "@/lib/auth";
import { Role } from "@/lib/generated/prisma/enums";
import { generateWeeklyDigestNow } from "@/lib/weekly-digest-job";

/**
 * POST /api/admin/weekly-digest/generate — admin-only "Generate now". Creates
 * the digest as a draft (or publishes it, per the auto-publish setting).
 * 409 when the current period's digest already exists; quiet weeks create nothing.
 */
export async function POST() {
  try {
    await requireRole([Role.admin]);
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const result = await generateWeeklyDigestNow();
  if (result.status === "duplicate") {
    return NextResponse.json({ error: "The current digest has already been generated.", ...result }, { status: 409 });
  }
  return NextResponse.json(result);
}
