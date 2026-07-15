// Shared moderation types (§4.11/§4.13) — mirrors lib/blog.ts's split
// between plain data shapes (this file) and DB-touching queries
// (lib/moderation-server.ts), so lib/validation/moderation.ts (imported by
// both the API route and the client queue component) never has to pull in
// a "server-only" module.

export const MODERATION_TYPES = ["blog_post", "library_item", "forum_post"] as const;
export type ModerationType = (typeof MODERATION_TYPES)[number];

export const MODERATION_TYPE_LABELS: Record<ModerationType, string> = {
  blog_post: "Blog",
  library_item: "Library",
  forum_post: "Forum",
};

export type ModerationItem = {
  id: string;
  type: ModerationType;
  title: string;
  excerpt: string;
  authorName: string | null;
  flagReason: string | null;
  createdAt: string;
  href: string;
};
