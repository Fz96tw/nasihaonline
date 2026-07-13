import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { NotificationType } from "@/lib/generated/prisma/enums";
import type { NotificationListItem } from "@/lib/notifications";

const FEED_LIMIT = 20;

/** Anything with a `.notification` delegate — the top-level client or a `$transaction` callback's `tx`. */
type NotificationClient = Prisma.TransactionClient | typeof db;

/**
 * Inserts a Notification (§4.10, scoped to Inbox-triggered types for this
 * phase — see the schema comment on NotificationType). Takes an optional
 * `client` so callers that already run inside a `db.$transaction` (e.g.
 * meeting-request acceptance, which must keep its ledger rows, status
 * flip, and notification from diverging) can pass `tx` instead of `db`.
 */
export async function createNotification(
  input: { recipientId: string; type: NotificationType; message: string; link: string },
  client: NotificationClient = db,
): Promise<void> {
  await client.notification.create({ data: input });
}

export async function getNotificationsForUser(
  userId: string,
  limit = FEED_LIMIT,
): Promise<{ items: NotificationListItem[]; unreadCount: number }> {
  const [notifications, unreadCount] = await Promise.all([
    db.notification.findMany({
      where: { recipientId: userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    db.notification.count({ where: { recipientId: userId, readAt: null } }),
  ]);

  return {
    items: notifications.map((notification) => ({
      id: notification.id,
      type: notification.type,
      message: notification.message,
      link: notification.link ?? "/inbox",
      unread: notification.readAt === null,
      createdAt: notification.createdAt.toISOString(),
    })),
    unreadCount,
  };
}

export class NotificationAccessError extends Error {
  constructor(
    public readonly status: 403 | 404,
    message: string,
  ) {
    super(message);
  }
}

/** Marks a single notification read, scoped to its recipient. Returns its link so the caller can navigate. */
export async function markNotificationRead(id: string, userId: string): Promise<{ id: string; link: string }> {
  const notification = await db.notification.findUnique({ where: { id } });
  if (!notification) throw new NotificationAccessError(404, "Notification not found.");
  if (notification.recipientId !== userId) {
    throw new NotificationAccessError(403, "You don't have access to this notification.");
  }

  if (notification.readAt === null) {
    await db.notification.update({ where: { id }, data: { readAt: new Date() } });
  }

  return { id: notification.id, link: notification.link ?? "/inbox" };
}
