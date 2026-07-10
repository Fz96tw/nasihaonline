import { NextResponse } from "next/server";

/**
 * Reference protected route. The 401-on-missing-session check itself lives
 * in middleware.ts (isProtectedRoute) — this handler only runs once that
 * check has already passed.
 */
export async function GET() {
  return NextResponse.json({ id: "placeholder", role: "member" });
}
