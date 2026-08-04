import "server-only";
import { db } from "@/lib/db";

/** Cheap count for the `/admin` dashboard badge and nav shield icon. */
export async function getUnreadContactMessageCount(): Promise<number> {
  return db.contactMessage.count({ where: { readAt: null } });
}

/** Side effect of viewing /admin/contact-messages — mirrors InboxMessage's mark-read-on-view pattern. */
export async function markAllContactMessagesRead(): Promise<void> {
  await db.contactMessage.updateMany({
    where: { readAt: null },
    data: { readAt: new Date() },
  });
}
