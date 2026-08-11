// Client-safe Peer Review & Feedback types/constants — kept separate from
// review-server.ts so client components can import them without pulling in
// the "server-only" query logic, same split as lib/library.ts.
//
// Content-type/level labels are shared verbatim with the Knowledge Library
// (lib/library.ts) — a ReviewItem reuses KnowledgeContentType/KnowledgeLevel
// directly rather than a duplicated enum, since the taxonomy is identical.
export { CONTENT_TYPE_LABELS, LEVEL_LABELS } from "@/lib/library";

import { KnowledgeContentType, KnowledgeLevel, ReviewItemStatus, ReviewVolunteerStatus } from "@/lib/generated/prisma/enums";

export const REVIEW_STATUS_LABELS: Record<ReviewItemStatus, string> = {
  [ReviewItemStatus.open]: "Open",
  [ReviewItemStatus.closed]: "Closed",
};

export const REVIEW_STATUS_BADGE_VARIANT: Record<ReviewItemStatus, "neutral" | "success" | "warning" | "danger" | "info"> = {
  [ReviewItemStatus.open]: "info",
  [ReviewItemStatus.closed]: "neutral",
};

export const VOLUNTEER_STATUS_LABELS: Record<ReviewVolunteerStatus, string> = {
  [ReviewVolunteerStatus.pending]: "Pending",
  [ReviewVolunteerStatus.accepted]: "Accepted",
  [ReviewVolunteerStatus.declined]: "Declined",
  [ReviewVolunteerStatus.withdrawn]: "Withdrawn",
};

export type ReviewCategoryOption = {
  id: string;
  name: string;
  slug: string;
};

export type ReviewTagOption = {
  id: string;
  name: string;
  slug: string;
};

/** A reviewer's simplified roster entry — shown on the submitter's detail-page "Reviewers" panel. */
export type ReviewItemRosterMember = {
  userId: string;
  name: string | null;
  avatarUrl: string | null;
  /** Whether this invitee has posted at least one comment yet. */
  hasCommented: boolean;
};

/** /review-feedback "My Submissions" tab card. */
export type MyReviewSubmission = {
  id: string;
  title: string;
  contentType: KnowledgeContentType;
  status: ReviewItemStatus;
  categories: { name: string }[];
  invitees: { name: string | null; avatarUrl: string | null }[];
  commentCount: number;
  createdAt: string;
  hasNewActivity: boolean;
};

/** /review-feedback "Shared With Me" tab card. */
export type SharedReviewItem = {
  id: string;
  title: string;
  contentType: KnowledgeContentType;
  categories: { name: string }[];
  submitter: { id: string; name: string | null; avatarUrl: string | null };
  commentCount: number;
  createdAt: string;
  hasNewActivity: boolean;
  needsMyFeedback: boolean;
};

/** Submitter-only "Volunteer Offers" panel entry, on the detail page of a `seekingReviewers` item. */
export type PendingVolunteerOffer = {
  id: string;
  userId: string;
  name: string | null;
  avatarUrl: string | null;
  note: string | null;
  createdAt: string;
};

/** /review-feedback "Members Seeking Reviewers" tab card (community-wide, excludes the viewer's own items). */
export type SeekingReviewersItem = {
  id: string;
  title: string;
  description: string;
  contentType: KnowledgeContentType;
  level: KnowledgeLevel;
  categories: { name: string }[];
  submitter: { id: string; name: string | null; avatarUrl: string | null };
  createdAt: string;
  volunteerCount: number;
  myOfferStatus: ReviewVolunteerStatus | null;
};

/** /review-feedback/[id] detail page's data load. */
export type ReviewItemDetail = {
  id: string;
  title: string;
  description: string;
  contentType: KnowledgeContentType;
  level: KnowledgeLevel;
  status: ReviewItemStatus;
  seekingReviewers: boolean;
  categories: { name: string; slug: string }[];
  tags: { name: string; slug: string }[];
  submitter: { id: string; name: string | null };
  createdAt: string;
  youtubeUrl: string | null;
  heroImageUrl: string | null;
  externalUrl: string | null;
  attachment: { fileName: string; mimeType: string; url: string } | null;
  deidentificationConfirmed: boolean;
  publishedKnowledgeItemId: string | null;
  isSubmitter: boolean;
  isInvitee: boolean;
};

/** /review-feedback/[id]/edit's data load — a submission's full editable field set. */
export type ReviewItemForEdit = {
  id: string;
  title: string;
  description: string;
  contentType: KnowledgeContentType;
  level: KnowledgeLevel;
  status: ReviewItemStatus;
  categoryIds: string[];
  tagIds: string[];
  youtubeUrl: string | null;
  heroImageUrl: string | null;
  externalUrl: string | null;
  deidentificationConfirmed: boolean;
  submitterId: string;
  attachment: { fileName: string; url: string } | null;
};

export type ReviewCommentNode = {
  id: string;
  body: string;
  authorId: string;
  authorName: string | null;
  createdAt: string;
  editedAt: string | null;
  flagged: boolean;
  removed: boolean;
  replies: ReviewCommentNode[];
};
