import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireRole } from "@/lib/auth";
import { Role } from "@/lib/generated/prisma/enums";
import { previewWeeklyDigest } from "@/lib/weekly-digest-job";

/**
 * POST /api/admin/weekly-digest/preview — admin-only. Returns what the digest
 * (and the inactive-member email) would be right now under the saved
 * settings. Creates nothing. POST rather than GET only because the response
 * is computed fresh from live data and must never be cached.
 */
export async function POST() {
  let user;
  try {
    user = await requireRole([Role.admin]);
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  return NextResponse.json(await previewWeeklyDigest(user.name), { headers: { "Cache-Control": "no-store" } });
}
