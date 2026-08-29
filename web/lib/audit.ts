export const ADMIN_ACTION_LABELS: Record<string, string> = {
  "application.approved": "Approved membership application",
  "application.rejected": "Rejected membership application",
  "conduct.warning": "Recorded a conduct warning",
  "conduct.suspension": "Recorded a conduct suspension",
  "conduct.removal": "Recorded a conduct removal",
  "privacy.fulfilled": "Fulfilled a privacy data request",
  "content.dismissed": "Dismissed a content flag",
  "content.removed": "Removed flagged content",
  "content.self_deleted": "Deleted their own library item",
  "content.deleted": "Deleted a library item",
  "contact_message.read": "Marked a contact message as read",
  "contact_message.replied": "Replied to a contact message",
  "ledger.confirmed": "Confirmed knowledge hours",
  "ledger.rejected": "Rejected knowledge hours",
  "ledger.adjusted": "Adjusted a member's ledger balance",
  "user.deleted": "Deleted a user account",
};

export function formatAdminAction(action: string): string {
  return ADMIN_ACTION_LABELS[action] ?? action;
}

/** Where to link an Activity Log row's entity — most domains only have a queue/list page, not a per-item admin page. */
const ENTITY_HREF: Record<string, (entityId: string | null) => string> = {
  MembershipApplication: (id) => (id ? `/admin/applications/${id}` : "/admin/applications"),
  CodeOfConductViolation: () => "/admin/conduct",
  PrivacyDataRequest: () => "/admin/privacy-requests",
  ContactMessage: () => "/admin/contact-messages",
  Post: () => "/admin/content",
  PostComment: () => "/admin/content",
  KnowledgeItem: () => "/admin/content",
  ForumPost: () => "/admin/content",
};

export function adminActionEntityHref(entityType: string, entityId: string | null): string | null {
  return ENTITY_HREF[entityType]?.(entityId) ?? null;
}

/** Client-safe shape for rendering an inline per-entity history list (e.g. on /admin/contact-messages). */
export type AdminActionLogEntryView = {
  id: string;
  action: string;
  createdAt: string;
  actor: { name: string | null; email: string };
  metadata: Record<string, unknown> | null;
};
