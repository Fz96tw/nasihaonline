import "server-only";
import { db } from "@/lib/db";
import { uploadKnowledgeDocument, UploadValidationError } from "@/lib/storage";
import { NotificationType, KnowledgeContentType, KnowledgeLevel, KnowledgeStatus } from "@/lib/generated/prisma/enums";
import { createNotification } from "@/lib/notifications-server";
import type { KnowledgeCategoryOption, KnowledgeTagOption, MySubmission, ReviewQueueItem } from "@/lib/library";

export async function getKnowledgeCategories(): Promise<KnowledgeCategoryOption[]> {
  return db.knowledgeCategory.findMany({ orderBy: { name: "asc" } });
}

export async function getKnowledgeTags(): Promise<KnowledgeTagOption[]> {
  return db.knowledgeTag.findMany({ orderBy: { name: "asc" } });
}

export class KnowledgeItemError extends Error {
  constructor(
    public readonly status: 400 | 404,
    message: string,
  ) {
    super(message);
  }
}

/**
 * "Submit Resource" (§4.9) — always creates a `pending_review` item, never
 * publishes immediately (that's the Steward review workflow's job). Mirrors
 * createPost's licenseConsented gate, plus createEvent's contentType-
 * conditional deidentificationConfirmed gate. Unlike createPost, which type
 * requires binary and which requires youtubeUrl also has to be checked here
 * (not expressible in createKnowledgeItemSchema, since "was a file actually
 * attached" depends on the multipart FormData, not the parsed JSON-ish body).
 */
export async function createKnowledgeItem(
  contributorId: string,
  input: {
    title: string;
    description: string;
    contentType: KnowledgeContentType;
    level: KnowledgeLevel;
    categoryId: string;
    tagIds: string[];
    youtubeUrl: string | null;
    deidentificationConfirmed: boolean;
    licenseConsented: boolean;
    file: File | null;
  },
): Promise<{ id: string }> {
  if (!input.licenseConsented) {
    throw new KnowledgeItemError(400, "You must acknowledge the content licensing terms to submit.");
  }
  if (input.contentType === KnowledgeContentType.case_study && !input.deidentificationConfirmed) {
    throw new KnowledgeItemError(400, "You must confirm all patient information has been de-identified.");
  }

  const category = await db.knowledgeCategory.findUnique({ where: { id: input.categoryId }, select: { id: true } });
  if (!category) {
    throw new KnowledgeItemError(400, "Select a valid category.");
  }

  const isRecordedLecture = input.contentType === KnowledgeContentType.recorded_lecture;
  if (isRecordedLecture && !input.youtubeUrl) {
    throw new KnowledgeItemError(400, "A YouTube URL is required for a recorded lecture.");
  }
  if (!isRecordedLecture && !input.file) {
    throw new KnowledgeItemError(400, "A file upload is required for this content type.");
  }

  let attachment: { objectKey: string; fileName: string; mimeType: string; sizeBytes: number } | null = null;
  if (!isRecordedLecture && input.file) {
    try {
      attachment = await uploadKnowledgeDocument(input.file);
    } catch (error) {
      if (error instanceof UploadValidationError) {
        throw new KnowledgeItemError(400, error.message);
      }
      throw error;
    }
  }

  const item = await db.knowledgeItem.create({
    data: {
      title: input.title,
      description: input.description,
      contentType: input.contentType,
      level: input.level,
      contributorId,
      categoryId: input.categoryId,
      youtubeUrl: isRecordedLecture ? input.youtubeUrl : null,
      deidentificationConfirmed: input.deidentificationConfirmed,
      licenseConsented: true,
      status: KnowledgeStatus.pending_review,
      tags: { create: input.tagIds.map((tagId) => ({ tagId })) },
      attachments: attachment ? { create: [attachment] } : undefined,
    },
    select: { id: true },
  });

  return item;
}

/** /library/mine (§4.9) — a member's own submissions at any status, newest first. */
export async function getMySubmissions(contributorId: string): Promise<MySubmission[]> {
  const items = await db.knowledgeItem.findMany({
    where: { contributorId },
    select: {
      id: true,
      title: true,
      contentType: true,
      status: true,
      category: { select: { name: true } },
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return items.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() }));
}

/** GET /api/admin/library/review-queue (§4.9) — Steward/admin pre-publish queue. */
export async function getReviewQueue(): Promise<ReviewQueueItem[]> {
  const items = await db.knowledgeItem.findMany({
    where: { status: KnowledgeStatus.pending_review },
    select: {
      id: true,
      title: true,
      description: true,
      contentType: true,
      level: true,
      category: { select: { name: true } },
      contributor: { select: { name: true, email: true } },
      deidentificationConfirmed: true,
      youtubeUrl: true,
      attachments: { select: { id: true, fileName: true, mimeType: true, sizeBytes: true, objectKey: true } },
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return items.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() }));
}

/**
 * POST /api/admin/library/:id/publish (§4.9) — transitions a pending_review
 * item to published or rejected and notifies the submitter
 * (resource_review_update), mirroring how createPostComment notifies a
 * post's author. Only pending_review items can be acted on — already-
 * reviewed items (or a double-submit) are rejected with a 409-shaped error.
 */
export async function reviewKnowledgeItem(id: string, action: "publish" | "reject"): Promise<{ id: string; status: KnowledgeStatus }> {
  const item = await db.knowledgeItem.findUnique({
    where: { id },
    select: { id: true, title: true, status: true, contributorId: true },
  });
  if (!item) throw new KnowledgeItemError(404, "Resource not found.");
  if (item.status !== KnowledgeStatus.pending_review) {
    throw new KnowledgeItemError(400, `This resource is already ${item.status}.`);
  }

  const status = action === "publish" ? KnowledgeStatus.published : KnowledgeStatus.rejected;
  const updated = await db.knowledgeItem.update({
    where: { id },
    data: { status },
    select: { id: true, status: true },
  });

  await createNotification({
    recipientId: item.contributorId,
    type: NotificationType.resource_review_update,
    message:
      action === "publish"
        ? `Your submission "${item.title}" was published to the Knowledge Library.`
        : `Your submission "${item.title}" was not approved for the Knowledge Library.`,
    link: "/library/mine",
  });

  return updated;
}
