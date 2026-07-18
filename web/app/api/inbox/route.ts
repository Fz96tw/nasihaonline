import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireTier } from "@/lib/auth";
import { getInboxList } from "@/lib/inbox-server";
import { INBOX_TIERS } from "@/lib/members";

/**
 * GET /api/inbox — the signed-in member's inbox list, most-recent-activity
 * first (§4.7). Gated to INBOX_TIERS — Friend tier has no Inbox access
 * since the Inbox is exclusively Directory-originated (§2.2).
 */
export async function GET() {
  let user;
  try {
    user = await requireTier(INBOX_TIERS);
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const items = await getInboxList(user.id);
  return NextResponse.json({ items });
}
