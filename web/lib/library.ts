// Client-safe Knowledge Library types/constants (PRD §4.9) — kept separate
// from library-server.ts so client components can import them without
// pulling in the "server-only" query logic, same split as lib/events.ts.
import { KnowledgeContentType, KnowledgeLevel, KnowledgeStatus, KnowledgeVisibility } from "@/lib/generated/prisma/enums";

export const CONTENT_TYPE_LABELS: Record<KnowledgeContentType, string> = {
  [KnowledgeContentType.recorded_lecture]: "Recorded Lecture",
  [KnowledgeContentType.article]: "Article / Summary",
  [KnowledgeContentType.case_study]: "Case Study",
  [KnowledgeContentType.guideline]: "Guideline",
};

export const LEVEL_LABELS: Record<KnowledgeLevel, string> = {
  [KnowledgeLevel.student_friendly]: "Student-Friendly",
  [KnowledgeLevel.early_career]: "Early Career",
  [KnowledgeLevel.advanced]: "Advanced",
  [KnowledgeLevel.all_levels]: "All Levels",
};

export const STATUS_LABELS: Record<KnowledgeStatus, string> = {
  [KnowledgeStatus.pending_review]: "Pending Review",
  [KnowledgeStatus.published]: "Published",
  [KnowledgeStatus.flagged]: "Flagged",
  [KnowledgeStatus.rejected]: "Rejected",
};

export const STATUS_BADGE_VARIANT: Record<KnowledgeStatus, "neutral" | "success" | "warning" | "danger" | "info"> = {
  [KnowledgeStatus.pending_review]: "warning",
  [KnowledgeStatus.published]: "success",
  [KnowledgeStatus.flagged]: "danger",
  [KnowledgeStatus.rejected]: "danger",
};

export type KnowledgeCategoryOption = {
  id: string;
  name: string;
  slug: string;
};

export type KnowledgeCategoryWithCount = KnowledgeCategoryOption & { count: number };

export type KnowledgeTagOption = {
  id: string;
  name: string;
  slug: string;
};

/** /library/mine — a submitter's own item, at any status. */
export type MySubmission = {
  id: string;
  title: string;
  contentType: KnowledgeContentType;
  status: KnowledgeStatus;
  categories: { name: string }[];
  createdAt: string;
};

/** /library browse card (§4.9) — published or flagged items only. */
export type LibraryCard = {
  id: string;
  title: string;
  description: string;
  contentType: KnowledgeContentType;
  level: KnowledgeLevel;
  status: KnowledgeStatus;
  visibility: KnowledgeVisibility;
  categories: { name: string; slug: string }[];
  contributor: { id: string; name: string | null };
  createdAt: string;
  youtubeUrl: string | null;
  // Custom cover image (§4.9), pre-resolved server-side to a proxied URL —
  // null means "no custom image", which renderers fall back to the video's
  // YouTube thumbnail for, not "broken image".
  heroImageUrl: string | null;
  // Alternative to `attachment` for article/case_study/guideline items — a
  // link to a resource hosted elsewhere, mutually exclusive with it.
  externalUrl: string | null;
  // url is pre-resolved server-side (getKnowledgeDocumentUrl lives in the
  // server-only lib/storage.ts) so client components never need to import
  // that module themselves.
  attachment: { fileName: string; mimeType: string; url: string } | null;
  viewCount: number;
  // Reply count on the on-demand discussion thread, excluding the
  // auto-authored opening post — 0 when no thread has been started yet.
  commentCount: number;
};

export type LibrarySort = "recent" | "viewed" | "commented";

/**
 * /library/[id] detail page's data load (§4.9) — the browse card's fields
 * plus tags, the de-identification badge, and the on-demand discussion
 * thread's linkage (null forumThreadId means "Start a Discussion", not yet
 * started; forumReplyCount excludes the auto-authored opening post, same
 * derivation as MemberEvent.forumReplyCount).
 */
export type KnowledgeItemDetail = LibraryCard & {
  tags: { name: string; slug: string }[];
  deidentificationConfirmed: boolean;
  forumThreadId: string | null;
  forumReplyCount: number | null;
  viewCount: number;
};

/**
 * Full per-person invited-member roster for a restricted item's detail page
 * (Restricted Knowledge Library Submissions, Objective 05) — mirrors
 * EventRosterMember, minus the RSVP-derived `status` field: there's no
 * RSVP analog for the Library, so every invitee is presented flat, with no
 * per-person state to distinguish them by.
 */
export type KnowledgeItemRosterMember = {
  userId: string;
  name: string | null;
  avatarUrl: string | null;
};

/** /library/[id]/edit's data load — a submission's full editable field set, at any status. */
export type KnowledgeItemForEdit = {
  id: string;
  title: string;
  description: string;
  contentType: KnowledgeContentType;
  level: KnowledgeLevel;
  status: KnowledgeStatus;
  categoryIds: string[];
  tagIds: string[];
  youtubeUrl: string | null;
  heroImageUrl: string | null;
  externalUrl: string | null;
  deidentificationConfirmed: boolean;
  contributorId: string;
  attachment: { fileName: string; url: string } | null;
};

/** Dashboard "recently added to the library" widget row (§4.10). */
export type RecentLibraryItem = {
  id: string;
  title: string;
  contentType: KnowledgeContentType;
  createdAt: string;
};

/** /admin/library/review-queue row (§4.9) — Steward/admin only. */
export type ReviewQueueItem = {
  id: string;
  title: string;
  description: string;
  contentType: KnowledgeContentType;
  level: KnowledgeLevel;
  categories: { name: string }[];
  contributor: { name: string | null; email: string };
  deidentificationConfirmed: boolean;
  youtubeUrl: string | null;
  externalUrl: string | null;
  attachments: { id: string; fileName: string; mimeType: string; sizeBytes: number; objectKey: string }[];
  visibility: KnowledgeVisibility;
  invitees: { name: string | null }[];
  createdAt: string;
};
