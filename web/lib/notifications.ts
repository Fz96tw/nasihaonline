// Client-safe Notification types (PRD §4.10, scoped to Inbox-triggered
// types for this phase — §11). Kept separate from notifications-server.ts
// so client components can import them without pulling in server-only code.
import type { NotificationType } from "@/lib/generated/prisma/enums";

export type NotificationListItem = {
  id: string;
  type: NotificationType;
  message: string;
  /** Where opening this notification should navigate — always an Inbox item for this phase. */
  link: string;
  unread: boolean;
  createdAt: string;
};
