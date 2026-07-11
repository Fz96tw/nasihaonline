import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";

/**
 * Reference protected route. Middleware only checks that a Clerk session
 * exists (see middleware.ts); this handler does the authoritative check —
 * real session verification plus the local User lookup — via requireUser().
 */
export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json({ id: user.id, email: user.email, role: user.role });
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }
}
