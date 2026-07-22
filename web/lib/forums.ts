// Shared Forums types (§4.13) — mirrors lib/blog.ts's split between plain
// data shapes (this file) and DB-touching queries (lib/forums-server.ts).

import type { DirectoryMember } from "@/lib/members";

// Seeded forum slug (see prisma/seed.ts's slugify("Clinical Discussions"))
// that gates the de-identification confirmation, same rule as
// KnowledgeItem's case_study contentType and Event's case_discussion type.
export const CLINICAL_DISCUSSIONS_SLUG = "clinical-discussions";

// Seeded forum slug (the "Events Discussion" forum in prisma/seed.ts, slug
// unchanged from its original "Events" name) that holds the auto-created
// discussion thread behind an Event's optional "create a discussion thread"
// checkbox (§4.6) — createEvent links new threads here.
export const EVENTS_FORUM_SLUG = "events";

// Seeded forum slug (the "Library Discussions" forum in prisma/seed.ts)
// that holds the on-demand discussion thread behind a Knowledge Library
// item's "Start a Discussion" button (§4.9) — unlike EVENTS_FORUM_SLUG's
// opt-in-at-creation checkbox, the thread is only created lazily, the
// first time any member actually wants to discuss the resource.
export const LIBRARY_FORUM_SLUG = "library-discussions";

export type ForumCategory = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  threadCount: number;
  /** Only populated by getForumCategories, for the /forums sort buttons. */
  postCount?: number;
  lastActivityAt?: string | null;
};

export type ForumThreadListItem = {
  id: string;
  title: string;
  pinned: boolean;
  authorName: string | null;
  createdAt: string;
  replyCount: number;
  viewCount: number;
  lastActivityAt: string;
};

/** A post/reply on a ForumThread (§4.13), nested by `parentPostId` into a reply tree. */
export type ForumPostNode = {
  id: string;
  body: string;
  authorId: string;
  authorName: string | null;
  /** Author's Directory profile, if they're directory-listed and tier-eligible (§4.3/§9) — null otherwise, in which case the author's avatar isn't clickable. */
  authorProfile: DirectoryMember | null;
  createdAt: string;
  flagged: boolean;
  removed: boolean;
  replies: ForumPostNode[];
};

/**
 * /members/[memberId]'s Forums section (§4.5) — one row per distinct thread
 * this member has posted or replied in (deduped, not one row per post),
 * ordered by their most recent activity in that thread.
 */
export type MemberForumThread = {
  id: string;
  title: string;
  forumSlug: string;
  forumName: string;
  lastPostAt: string;
};

export type ForumThreadDetail = {
  id: string;
  title: string;
  pinned: boolean;
  authorId: string;
  authorName: string | null;
  createdAt: string;
  replyCount: number;
  viewCount: number;
  forum: { id: string; name: string; slug: string };
  posts: ForumPostNode[];
};
