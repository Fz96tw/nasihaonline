import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { SendMessageError, sendMessage } from "@/lib/inbox-server";
import { sendMessageSchema } from "@/lib/validation/inbox";

/**
 * POST /api/inbox/messages — new top-level message (from a Directory card's
 * "Send Message") or a reply (parentId set) that threads under the
 * original item (§4.7).
 */
export async function POST(request: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const parsed = sendMessageSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await sendMessage(user.id, parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof SendMessageError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
