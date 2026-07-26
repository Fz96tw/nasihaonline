// Client-safe Notification types (PRD §4.10, scoped to Inbox-triggered
// types for this phase — §11). Kept separate from notifications-server.ts
// so client components can import them without pulling in server-only code.
import type { NotificationType } from "@/lib/generated/prisma/enums";

export type NotificationListItem = {
  id: string;
  type: NotificationType;
  message: string;
  /** Where opening this notification should navigate. Null means it's informational only — no page to open (e.g. you lost access to what it refers to). */
  link: string | null;
  unread: boolean;
  createdAt: string;
};
