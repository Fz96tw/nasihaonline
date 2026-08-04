import "server-only";
import { db } from "@/lib/db";
import type { ContactMessageModel } from "@/lib/generated/prisma/models/ContactMessage";
import { recordAdminAction } from "@/lib/audit-server";
import { sendContactMessageReplyEmail } from "@/lib/email";

export class ContactError extends Error {
  constructor(
    public readonly status: 400 | 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

/** Cheap count for the `/admin` dashboard badge and nav shield icon. */
export async function getUnreadContactMessageCount(): Promise<number> {
  return db.contactMessage.count({ where: { readAt: null } });
}

/** Explicit per-message "Mark as read" — always requires a short note (why it doesn't need a reply: spam, handled by phone, etc.), visible to other admins via AdminActionLog. No email sent. */
export async function markContactMessageRead(
  id: string,
  adminId: string,
  note: string,
): Promise<ContactMessageModel> {
  const message = await db.contactMessage.findUnique({ where: { id } });
  if (!message) throw new ContactError(404, "Message not found.");

  return db.$transaction(async (tx) => {
    const updated = await tx.contactMessage.update({ where: { id }, data: { readAt: new Date() } });
    await recordAdminAction(
      { actorId: adminId, action: "contact_message.read", entityType: "ContactMessage", entityId: id, metadata: { note } },
      tx,
    );
    return updated;
  });
}

/**
 * Sends a real outbound reply email (one-way — see sendContactMessageReplyEmail),
 * then marks the message read. Email send happens BEFORE the DB write and is
 * allowed to throw (unlike the best-effort pattern used for welcome/
 * confirmation emails) — a failed reply must surface as an error to the
 * admin, not be silently swallowed, since sending IS the action here.
 */
export async function replyToContactMessage(
  id: string,
  adminId: string,
  body: string,
): Promise<ContactMessageModel> {
  const message = await db.contactMessage.findUnique({ where: { id } });
  if (!message) throw new ContactError(404, "Message not found.");

  await sendContactMessageReplyEmail(message.email, message.subject, body);

  return db.$transaction(async (tx) => {
    const updated = await tx.contactMessage.update({
      where: { id },
      data: { readAt: message.readAt ?? new Date() },
    });
    await recordAdminAction(
      { actorId: adminId, action: "contact_message.replied", entityType: "ContactMessage", entityId: id, metadata: { body } },
      tx,
    );
    return updated;
  });
}
