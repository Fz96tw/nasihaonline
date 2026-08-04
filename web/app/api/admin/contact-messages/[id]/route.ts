import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireRole } from "@/lib/auth";
import { Role } from "@/lib/generated/prisma/enums";
import { ContactError, markContactMessageRead, replyToContactMessage } from "@/lib/contact-server";
import { contactMessageActionSchema } from "@/lib/validation/contact-message-action";

/**
 * PATCH /api/admin/contact-messages/:id — the two deliberate per-message
 * actions replacing the old auto-mark-read-on-view side effect: "read"
 * (requires a note, no email) and "reply" (sends a real email, also marks
 * read). Both log to AdminActionLog so another admin can see who acted.
 */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  let admin;
  try {
    admin = await requireRole([Role.admin]);
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const parsed = contactMessageActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    if (parsed.data.action === "read") {
      const message = await markContactMessageRead(params.id, admin.id, parsed.data.note);
      return NextResponse.json({ message });
    }

    const message = await replyToContactMessage(params.id, admin.id, parsed.data.body);
    return NextResponse.json({ message });
  } catch (error) {
    if (error instanceof ContactError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Error) {
      // sendContactMessageReplyEmail throws a plain Error on send failure —
      // surface it as a 502 rather than a generic 500, and do NOT mark the
      // message read or log anything (already guaranteed by the throw
      // happening before replyToContactMessage's transaction).
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    throw error;
  }
}
