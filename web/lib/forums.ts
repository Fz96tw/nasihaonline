// Shared Forums types (§4.13) — mirrors lib/blog.ts's split between plain
// data shapes (this file) and DB-touching queries (lib/forums-server.ts).

// Seeded forum slug (see prisma/seed.ts's slugify("Clinical Discussions"))
// that gates the de-identification confirmation, same rule as
// KnowledgeItem's case_study contentType and Event's case_discussion type.
export const CLINICAL_DISCUSSIONS_SLUG = "clinical-discussions";

export type ForumCategory = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  threadCount: number;
};

export type ForumThreadListItem = {
  id: string;
  title: string;
  pinned: boolean;
  authorName: string | null;
  createdAt: string;
  replyCount: number;
  lastActivityAt: string;
};

/** A post/reply on a ForumThread (§4.13), nested by `parentPostId` into a reply tree. */
export type ForumPostNode = {
  id: string;
  body: string;
  authorId: string;
  authorName: string | null;
  createdAt: string;
  flagged: boolean;
  replies: ForumPostNode[];
};

export type ForumThreadDetail = {
  id: string;
  title: string;
  pinned: boolean;
  authorId: string;
  authorName: string | null;
  createdAt: string;
  forum: { id: string; name: string; slug: string };
  posts: ForumPostNode[];
};
