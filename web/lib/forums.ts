// Shared Forums types (§4.13) — mirrors lib/blog.ts's split between plain
// data shapes (this file) and DB-touching queries (lib/forums-server.ts).

import { ForumThreadVisibility } from "@/lib/generated/prisma/enums";
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

// Seeded forum slug for meta-discussion about the site itself (bug reports,
// feature requests, dev/testing threads — e.g. "Page footer NASIHA
// disclaimer updated") rather than genuine community content. Ordinary
// browsing (What's New, the forum itself) is unaffected; this exists purely
// so getFeedPage's search mode (lib/feed-server.ts) can exclude it from
// results — a member searching the site shouldn't have to wade through
// threads about the site's own nav bar or footer to find real content.
export const COMMUNITY_FEEDBACK_FORUM_SLUG = "community-feedback";

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
  authorId: string;
  authorName: string | null;
  createdAt: string;
  replyCount: number;
  viewCount: number;
  lastActivityAt: string;
  /** Member-Initiated Restricted Forum Threads (§4.13/§11.16) — only ever `invited` for a standalone thread its author, an invitee, or a moderator/admin can see; every other viewer never receives this row at all. */
  visibility: ForumThreadVisibility;
};

/** Member-Initiated Restricted Forum Threads (§4.13/§11.16) — one row per invited member, shown on the thread detail page's invite-management panel. No RSVP-equivalent status, same rationale as KnowledgeItemRosterMember. */
export type ForumThreadRosterMember = {
  userId: string;
  name: string | null;
  avatarUrl: string | null;
};

// Shared "Everyone" / "Invited only" audience badge for a ForumThread —
// mirrors getEventAudienceBadge (lib/events.ts), minus the "Open" case
// (forums have no public/anonymous audience).
export function getForumThreadAudienceBadge(thread: {
  visibility: ForumThreadVisibility;
}): { label: string; variant: "info" | "warning" } {
  if (thread.visibility === ForumThreadVisibility.invited) return { label: "Invited Only", variant: "warning" };
  return { label: "Everyone", variant: "info" };
}

/** A post/reply on a ForumThread (§4.13), nested by `parentPostId` into a reply tree. */
export type ForumPostNode = {
  id: string;
  body: string;
  authorId: string;
  authorName: string | null;
  /** Author's Directory profile, if they're directory-listed and tier-eligible (§4.3/§9) — null otherwise, in which case the author's avatar isn't clickable. */
  authorProfile: DirectoryMember | null;
  createdAt: string;
  /** Set once the author (or a moderator/admin) edits this post's body after posting — null until the first edit. */
  editedAt: string | null;
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
  /** True when this member (userId, not viewerId) authored the thread itself, not just a reply in it — used by /my-posts to label "Started" vs "Replied". */
  startedByMember: boolean;
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
  /** Member-Initiated Restricted Forum Threads (§4.13/§11.16). */
  visibility: ForumThreadVisibility;
  /** Populated only when visibility is `invited` — empty for a `community` thread. */
  invitees: ForumThreadRosterMember[];
  /** False for a thread linked to an Event or Knowledge Library item (inherited visibility) — its title/audience are managed automatically and can't be edited via /forums/[category]/[threadId]/edit. */
  isEditable: boolean;
};
