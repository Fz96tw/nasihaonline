import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireTier } from "@/lib/auth";
import { GroupMessageError, createGroupMessage } from "@/lib/inbox-groups-server";
import { INBOX_TIERS } from "@/lib/members";
import { createGroupMessageSchema } from "@/lib/validation/inbox";

/**
 * POST /api/inbox/groups — starts a group message (§4.7) from the Inbox
 * composer. Gated to INBOX_TIERS like every Inbox route — Friend tier has
 * no Inbox access (§2.2).
 */
export async function POST(request: Request) {
  let user;
  try {
    user = await requireTier(INBOX_TIERS);
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const parsed = createGroupMessageSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await createGroupMessage(user.id, parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof GroupMessageError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
