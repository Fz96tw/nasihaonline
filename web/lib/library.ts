// Client-safe Knowledge Library types/constants (PRD §4.9) — kept separate
// from library-server.ts so client components can import them without
// pulling in the "server-only" query logic, same split as lib/events.ts.
import { KnowledgeContentType, KnowledgeLevel, KnowledgeStatus } from "@/lib/generated/prisma/enums";

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
  category: { name: string };
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
  category: { name: string; slug: string };
  contributor: { name: string | null };
  createdAt: string;
  youtubeUrl: string | null;
  // url is pre-resolved server-side (getKnowledgeDocumentUrl lives in the
  // server-only lib/storage.ts) so client components never need to import
  // that module themselves.
  attachment: { fileName: string; mimeType: string; url: string } | null;
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
  category: { name: string };
  contributor: { name: string | null; email: string };
  deidentificationConfirmed: boolean;
  youtubeUrl: string | null;
  attachments: { id: string; fileName: string; mimeType: string; sizeBytes: number; objectKey: string }[];
  createdAt: string;
};
