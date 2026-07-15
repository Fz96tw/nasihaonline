import "server-only";
import { db } from "@/lib/db";
import { uploadKnowledgeDocument, getKnowledgeDocumentUrl, UploadValidationError } from "@/lib/storage";
import { searchLibraryDocuments } from "@/lib/meilisearch";
import { NotificationType, KnowledgeContentType, KnowledgeLevel, KnowledgeStatus } from "@/lib/generated/prisma/enums";
import { createNotification } from "@/lib/notifications-server";
import type {
  KnowledgeCategoryOption,
  KnowledgeTagOption,
  LibraryCard,
  MySubmission,
  RecentLibraryItem,
  ReviewQueueItem,
} from "@/lib/library";

const LIBRARY_CARD_SELECT = {
  id: true,
  title: true,
  description: true,
  contentType: true,
  level: true,
  status: true,
  createdAt: true,
  youtubeUrl: true,
  category: { select: { name: true, slug: true } },
  contributor: { select: { name: true } },
  attachments: { select: { fileName: true, mimeType: true, objectKey: true }, take: 1 },
} as const;

function toLibraryCard(item: {
  id: string;
  title: string;
  description: string;
  contentType: KnowledgeContentType;
  level: KnowledgeLevel;
  status: KnowledgeStatus;
  createdAt: Date;
  youtubeUrl: string | null;
  category: { name: string; slug: string };
  contributor: { name: string | null };
  attachments: { fileName: string; mimeType: string; objectKey: string }[];
}): LibraryCard {
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    contentType: item.contentType,
    level: item.level,
    status: item.status,
    category: item.category,
    contributor: item.contributor,
    createdAt: item.createdAt.toISOString(),
    youtubeUrl: item.youtubeUrl,
    attachment: item.attachments[0]
      ? {
          fileName: item.attachments[0].fileName,
          mimeType: item.attachments[0].mimeType,
          url: getKnowledgeDocumentUrl(item.attachments[0].objectKey),
        }
      : null,
  };
}

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

/**
 * /library browse listing (§4.9) — plain Postgres query filtered/sorted by
 * createdAt for a browse view (`q` absent), or a Meilisearch-backed query
 * for `q` present (§7.2/§9), same "real query goes to Meilisearch, browse
 * stays on Postgres" split as getPublishedPosts. `published` and `flagged`
 * items both appear — only `pending_review`/`rejected` are excluded, since
 * flagged items "stay visible" per the community-flagging model.
 */
export async function getPublishedKnowledgeItems(params: {
  contentType?: KnowledgeContentType;
  level?: KnowledgeLevel;
  categorySlug?: string;
  q?: string;
}): Promise<LibraryCard[]> {
  const visibleStatuses = [KnowledgeStatus.published, KnowledgeStatus.flagged];
  const filters = {
    ...(params.contentType ? { contentType: params.contentType } : {}),
    ...(params.level ? { level: params.level } : {}),
    ...(params.categorySlug ? { category: { slug: params.categorySlug } } : {}),
  };

  if (params.q?.trim()) {
    const hits = await searchLibraryDocuments(params.q.trim(), {
      contentType: params.contentType,
      level: params.level,
      categorySlug: params.categorySlug,
    });
    if (hits.length === 0) return [];

    const items = await db.knowledgeItem.findMany({
      where: { id: { in: hits.map((hit) => hit.id) }, status: { in: visibleStatuses } },
      select: LIBRARY_CARD_SELECT,
    });
    const byId = new Map(items.map((item) => [item.id, item]));
    return hits.map((hit) => byId.get(hit.id)).filter((item) => item != null).map(toLibraryCard);
  }

  const items = await db.knowledgeItem.findMany({
    where: { status: { in: visibleStatuses }, ...filters },
    select: LIBRARY_CARD_SELECT,
    orderBy: { createdAt: "desc" },
  });
  return items.map(toLibraryCard);
}

/** Dashboard "recently added to the library" widget (§4.10). */
export async function getRecentlyPublishedKnowledgeItems(limit = 5): Promise<RecentLibraryItem[]> {
  const items = await db.knowledgeItem.findMany({
    where: { status: { in: [KnowledgeStatus.published, KnowledgeStatus.flagged] } },
    select: { id: true, title: true, contentType: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return items.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() }));
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

/**
 * POST /api/library/:id/flag (§4.9) — community flagging. Only a currently
 * `published` item can be flagged (not pending_review/rejected, and not a
 * second time while already flagged) — a Steward resolves a flagged item
 * back to published or removes it, which is out of scope for this
 * objective (no admin tooling for it yet).
 */
export async function flagKnowledgeItem(id: string): Promise<{ id: string; status: KnowledgeStatus }> {
  const item = await db.knowledgeItem.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!item) throw new KnowledgeItemError(404, "Resource not found.");
  if (item.status !== KnowledgeStatus.published) {
    throw new KnowledgeItemError(400, "Only a published resource can be flagged.");
  }

  return db.knowledgeItem.update({
    where: { id },
    data: { status: KnowledgeStatus.flagged },
    select: { id: true, status: true },
  });
}

/**
 * PATCH /api/admin/content (§4.11) — a Steward/admin resolving a flagged
 * item from the shared moderation queue: "dismiss" returns it to published
 * (stays visible, unchanged), "remove" rejects it, the same status Library
 * items already use to mean "not visible" (getPublishedKnowledgeItems only
 * shows published/flagged).
 */
export async function resolveFlaggedKnowledgeItem(
  id: string,
  action: "dismiss" | "remove",
): Promise<{ id: string; status: KnowledgeStatus }> {
  const item = await db.knowledgeItem.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!item) throw new KnowledgeItemError(404, "Resource not found.");
  if (item.status !== KnowledgeStatus.flagged) {
    throw new KnowledgeItemError(400, "This resource is not currently flagged.");
  }

  return db.knowledgeItem.update({
    where: { id },
    data: { status: action === "remove" ? KnowledgeStatus.rejected : KnowledgeStatus.published },
    select: { id: true, status: true },
  });
}
