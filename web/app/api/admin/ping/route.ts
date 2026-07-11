import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireRole } from "@/lib/auth";
import { Role } from "@/lib/generated/prisma/enums";

/**
 * Reference admin-only route: 401 unauthenticated, 403 authenticated but
 * not admin, 200 for admins. Demonstrates the RBAC half of AC 9 with an
 * exact HTTP status (the /admin page can't get a real 403 from the App
 * Router the way a route handler can — see app/admin/page.tsx).
 */
export async function GET() {
  try {
    await requireRole([Role.admin]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }
}
