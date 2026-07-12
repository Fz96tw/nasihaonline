import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { getInboxList } from "@/lib/inbox-server";

/** GET /api/inbox — the signed-in member's inbox list, most-recent-activity first (§4.7). */
export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const items = await getInboxList(user.id);
  return NextResponse.json({ items });
}
