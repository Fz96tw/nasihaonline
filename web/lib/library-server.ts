import "server-only";
import { db } from "@/lib/db";
import {
  uploadKnowledgeDocument,
  getKnowledgeDocumentUrl,
  deleteKnowledgeDocument,
  UploadValidationError,
} from "@/lib/storage";
import { searchLibraryDocuments } from "@/lib/meilisearch";
import {
  NotificationType,
  KnowledgeContentType,
  KnowledgeLevel,
  KnowledgeStatus,
  Role,
  ContributionSource,
  LedgerStatus,
  LedgerTransactionType,
} from "@/lib/generated/prisma/enums";
import type { UserModel } from "@/lib/generated/prisma/models/User";
import { createNotification } from "@/lib/notifications-server";
import { LIBRARY_FORUM_SLUG } from "@/lib/forums";
import type {
  KnowledgeCategoryOption,
  KnowledgeItemDetail,
  KnowledgeItemForEdit,
  KnowledgeTagOption,
  LibraryCard,
  LibrarySort,
  MySubmission,
  RecentLibraryItem,
  ReviewQueueItem,
} from "@/lib/library";

// Absolute, not relative — same rationale as events-server.ts's createEvent:
// lib/linkify.tsx's linkifyText only turns absolute http(s) URLs into links.
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";

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
  contributor: { select: { id: true, name: true } },
  attachments: { select: { fileName: true, mimeType: true, objectKey: true }, take: 1 },
  _count: { select: { views: true } },
  forumThread: { select: { _count: { select: { posts: true } } } },
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
  contributor: { id: string; name: string | null };
  attachments: { fileName: string; mimeType: string; objectKey: string }[];
  _count: { views: number };
  forumThread: { _count: { posts: number } } | null;
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
    viewCount: item._count.views,
    commentCount: item.forumThread ? Math.max(item.forumThread._count.posts - 1, 0) : 0,
  };
}

// Applied in JS rather than a Prisma `orderBy` — commentCount depends on the
// optional forumThread relation, which Prisma can't order a top-level
// findMany by, and this way the same logic also covers the Meilisearch
// relevance-ordered `q` path.
function sortLibraryCards(cards: LibraryCard[], sort: LibrarySort): LibraryCard[] {
  const sorted = [...cards];
  if (sort === "viewed") sorted.sort((a, b) => b.viewCount - a.viewCount);
  else if (sort === "commented") sorted.sort((a, b) => b.commentCount - a.commentCount);
  else sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return sorted;
}

export async function getKnowledgeCategories(): Promise<KnowledgeCategoryOption[]> {
  return db.knowledgeCategory.findMany({ orderBy: { name: "asc" } });
}

export async function getKnowledgeTags(): Promise<KnowledgeTagOption[]> {
  return db.knowledgeTag.findMany({ orderBy: { name: "asc" } });
}

export class KnowledgeItemError extends Error {
  constructor(
    public readonly status: 400 | 403 | 404,
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
 * /library/[id]/edit's data load (editing a submission, §4.9) — the full
 * editable field set at any status (unlike getPublishedKnowledgeItems, a
 * pending_review or rejected item is still editable by its contributor).
 * Permission (contributor / Steward / admin) is checked by the caller, same
 * split as getPublishedPostBySlug + EditBlogPostPage.
 */
export async function getKnowledgeItemForEdit(id: string): Promise<KnowledgeItemForEdit | null> {
  const item = await db.knowledgeItem.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      description: true,
      contentType: true,
      level: true,
      status: true,
      categoryId: true,
      youtubeUrl: true,
      deidentificationConfirmed: true,
      contributorId: true,
      tags: { select: { tagId: true } },
      attachments: { select: { fileName: true, objectKey: true }, take: 1 },
    },
  });
  if (!item) return null;

  return {
    id: item.id,
    title: item.title,
    description: item.description,
    contentType: item.contentType,
    level: item.level,
    status: item.status,
    categoryId: item.categoryId,
    tagIds: item.tags.map(({ tagId }) => tagId),
    youtubeUrl: item.youtubeUrl,
    deidentificationConfirmed: item.deidentificationConfirmed,
    contributorId: item.contributorId,
    attachment: item.attachments[0]
      ? { fileName: item.attachments[0].fileName, url: getKnowledgeDocumentUrl(item.attachments[0].objectKey) }
      : null,
  };
}

/**
 * PATCH /api/library/:id — editing a submission (§4.9), by its contributor,
 * a Library Steward (moderator), or an admin. Stewards get edit rights here
 * (not just publish/reject) since correcting "quality, correct tagging"
 * (§4.9) directly is faster than reject-and-ask-to-resubmit. A rejected
 * item is the resubmit path — there's no separate "resubmit" action — so
 * an edit sends it back to pending_review; a published/flagged item's edit
 * goes live immediately with no re-review, same "no re-review on edit"
 * precedent as Blog (§11.12) — only the *initial* submission gates on
 * Steward review.
 */
export async function updateKnowledgeItem(
  id: string,
  actingUser: UserModel,
  input: {
    title: string;
    description: string;
    contentType: KnowledgeContentType;
    level: KnowledgeLevel;
    categoryId: string;
    tagIds: string[];
    youtubeUrl: string | null;
    deidentificationConfirmed: boolean;
    file: File | null;
  },
): Promise<{ id: string; status: KnowledgeStatus }> {
  const item = await db.knowledgeItem.findUnique({
    where: { id },
    select: {
      id: true,
      contributorId: true,
      status: true,
      attachments: { select: { id: true, objectKey: true }, take: 1 },
    },
  });
  if (!item) throw new KnowledgeItemError(404, "Resource not found.");

  const isPrivileged = actingUser.role === Role.admin || actingUser.role === Role.moderator;
  if (!isPrivileged && item.contributorId !== actingUser.id) {
    throw new KnowledgeItemError(403, "Only the submitter or a Library Steward/admin can edit this resource.");
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
  const existingAttachment = item.attachments[0] ?? null;
  if (!isRecordedLecture && !input.file && !existingAttachment) {
    throw new KnowledgeItemError(400, "A file upload is required for this content type.");
  }

  let newAttachment: { objectKey: string; fileName: string; mimeType: string; sizeBytes: number } | null = null;
  if (!isRecordedLecture && input.file) {
    try {
      newAttachment = await uploadKnowledgeDocument(input.file);
    } catch (error) {
      if (error instanceof UploadValidationError) {
        throw new KnowledgeItemError(400, error.message);
      }
      throw error;
    }
  }

  const nextStatus = item.status === KnowledgeStatus.rejected ? KnowledgeStatus.pending_review : item.status;
  // Drop the old attachment when it's being replaced by a new file, or when
  // contentType moved to recorded_lecture (which stores youtubeUrl instead).
  const dropsExistingAttachment = existingAttachment !== null && (isRecordedLecture || newAttachment !== null);

  const updated = await db.$transaction(async (tx) => {
    await tx.knowledgeItemTag.deleteMany({ where: { knowledgeItemId: item.id } });
    if (dropsExistingAttachment) {
      await tx.knowledgeAttachment.delete({ where: { id: existingAttachment!.id } });
    }
    return tx.knowledgeItem.update({
      where: { id: item.id },
      data: {
        title: input.title,
        description: input.description,
        contentType: input.contentType,
        level: input.level,
        categoryId: input.categoryId,
        youtubeUrl: isRecordedLecture ? input.youtubeUrl : null,
        deidentificationConfirmed: input.deidentificationConfirmed,
        status: nextStatus,
        tags: { create: input.tagIds.map((tagId) => ({ tagId })) },
        attachments: newAttachment ? { create: [newAttachment] } : undefined,
      },
      select: { id: true, status: true },
    });
  });

  if (dropsExistingAttachment) {
    await deleteKnowledgeDocument(existingAttachment!.objectKey);
  }

  return updated;
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
  sort?: LibrarySort;
}): Promise<LibraryCard[]> {
  const visibleStatuses = [KnowledgeStatus.published, KnowledgeStatus.flagged];
  const filters = {
    ...(params.contentType ? { contentType: params.contentType } : {}),
    ...(params.level ? { level: params.level } : {}),
    ...(params.categorySlug ? { category: { slug: params.categorySlug } } : {}),
  };
  const sort = params.sort ?? "recent";

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
    const cards = hits.map((hit) => byId.get(hit.id)).filter((item) => item != null).map(toLibraryCard);
    return sortLibraryCards(cards, sort);
  }

  const items = await db.knowledgeItem.findMany({
    where: { status: { in: visibleStatuses }, ...filters },
    select: LIBRARY_CARD_SELECT,
    orderBy: { createdAt: "desc" },
  });
  return sortLibraryCards(items.map(toLibraryCard), sort);
}

/**
 * /library/[id] (§4.9) — the detail page's data load. Published/flagged
 * only, same visibility gate as getPublishedKnowledgeItems — a
 * pending_review/rejected item 404s here too, even for its own
 * contributor (they use /library/[id]/edit to see it instead).
 * forumThread's post count includes the auto-authored opening post, so
 * forumReplyCount subtracts one, same derivation as
 * getMemberEventById's forumReplyCount.
 */
export async function getPublishedKnowledgeItemById(id: string): Promise<KnowledgeItemDetail | null> {
  const item = await db.knowledgeItem.findUnique({
    where: { id },
    select: {
      ...LIBRARY_CARD_SELECT,
      deidentificationConfirmed: true,
      tags: { select: { tag: { select: { name: true, slug: true } } } },
      forumThread: { select: { id: true, _count: { select: { posts: true } } } },
      _count: { select: { views: true } },
    },
  });
  if (!item) return null;
  if (item.status !== KnowledgeStatus.published && item.status !== KnowledgeStatus.flagged) return null;

  return {
    ...toLibraryCard(item),
    deidentificationConfirmed: item.deidentificationConfirmed,
    tags: item.tags.map(({ tag }) => tag),
    forumThreadId: item.forumThread?.id ?? null,
    forumReplyCount: item.forumThread ? item.forumThread._count.posts - 1 : null,
    viewCount: item._count.views,
  };
}

export async function getKnowledgeItemViewCount(knowledgeItemId: string): Promise<number> {
  return db.knowledgeItemView.count({ where: { knowledgeItemId } });
}

/**
 * Records a unique visit to a resource's detail page for the eye-icon
 * count, called from POST /api/library/:id/view on every page load. Mirrors
 * recordEventView — /library/[id] redirects a signed-out visitor to
 * /sign-in before this can ever fire, so `userId` is always a real member
 * and this dedupes on the `[knowledgeItemId, userId]` unique constraint
 * directly.
 */
export async function recordKnowledgeItemView(knowledgeItemId: string, userId: string): Promise<number> {
  const item = await db.knowledgeItem.findUnique({ where: { id: knowledgeItemId }, select: { id: true } });
  if (!item) throw new KnowledgeItemError(404, "Resource not found.");

  await db.knowledgeItemView.createMany({ data: { knowledgeItemId, userId }, skipDuplicates: true });
  return getKnowledgeItemViewCount(knowledgeItemId);
}

/**
 * POST /api/library/:id/discussion (§4.9) — the on-demand "Start a
 * Discussion" action, any signed-in member (not just the contributor),
 * mirroring how any member can flag a published item. Unlike Events'
 * opt-in-at-creation checkbox, a Library item earns its thread lazily, the
 * first time anyone actually wants to discuss it — idempotent, so a second
 * call after one already exists just returns the existing thread instead
 * of erroring. Lives in the seeded "Library Discussions" forum
 * (LIBRARY_FORUM_SLUG), not Research & Resources.
 */
export async function startKnowledgeItemDiscussion(
  itemId: string,
  starterId: string,
): Promise<{ threadId: string }> {
  const item = await db.knowledgeItem.findUnique({
    where: { id: itemId },
    select: { id: true, title: true, status: true, forumThread: { select: { id: true } } },
  });
  if (!item) throw new KnowledgeItemError(404, "Resource not found.");
  if (item.status !== KnowledgeStatus.published && item.status !== KnowledgeStatus.flagged) {
    throw new KnowledgeItemError(400, "Only a published resource can have a discussion thread.");
  }
  if (item.forumThread) return { threadId: item.forumThread.id };

  const forum = await db.forum.findUnique({ where: { slug: LIBRARY_FORUM_SLUG }, select: { id: true } });
  if (!forum) {
    throw new KnowledgeItemError(400, "The Library Discussions forum isn't set up yet — contact an admin.");
  }

  const thread = await db.$transaction(async (tx) => {
    const created = await tx.forumThread.create({
      data: { forumId: forum.id, authorId: starterId, title: item.title, knowledgeItemId: item.id },
      select: { id: true },
    });
    await tx.forumPost.create({
      data: {
        threadId: created.id,
        authorId: starterId,
        body: `Discussion thread for this resource. [View resource details](${APP_URL}/library/${item.id})`,
      },
    });
    return created;
  });

  return { threadId: thread.id };
}

/**
 * /members/[memberId]'s Library section (§4.5/§4.9) — this member's
 * published/flagged submissions, newest first. Same visible-statuses gate
 * as getPublishedKnowledgeItems; a still-pending_review or rejected
 * submission stays private to /library/mine.
 */
export async function getPublishedKnowledgeItemsByContributor(contributorId: string): Promise<LibraryCard[]> {
  const items = await db.knowledgeItem.findMany({
    where: { contributorId, status: { in: [KnowledgeStatus.published, KnowledgeStatus.flagged] } },
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

/** Cheap count for the `/admin` dashboard badge — mirrors getReviewQueue's filter. */
export async function getReviewQueueCount(): Promise<number> {
  return db.knowledgeItem.count({ where: { status: KnowledgeStatus.pending_review } });
}

const CURATE_RESOURCE_ACTIVITY_KEY = "curate_resource";

/**
 * POST /api/admin/library/:id/publish (§4.9) — transitions a pending_review
 * item to published or rejected and notifies the submitter
 * (resource_review_update), mirroring how createPostComment notifies a
 * post's author. Only pending_review items can be acted on — already-
 * reviewed items (or a double-submit) are rejected with a 409-shaped error.
 *
 * On publish, also auto-credits Knowledge Hours (§4.4/§4.9) via the
 * curate_resource rule, same pattern as createPost's blog_post auto-earn —
 * best-effort: publishing must still succeed if the rule is missing/inactive,
 * and the entry lands pending in the admin's counterpart-less confirmation
 * queue since a curated-resource submission has no natural counterpart.
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
  const curateResourceRule =
    action === "publish"
      ? await db.contributionRule.findUnique({ where: { activityKey: CURATE_RESOURCE_ACTIVITY_KEY } })
      : null;

  const updated = await db.$transaction(async (tx) => {
    const result = await tx.knowledgeItem.update({
      where: { id },
      data: { status },
      select: { id: true, status: true },
    });

    if (curateResourceRule && curateResourceRule.active && curateResourceRule.type === LedgerTransactionType.earned) {
      const event = await tx.contributionEvent.create({
        data: {
          ruleId: curateResourceRule.id,
          actorId: item.contributorId,
          note: `Library submission: ${item.title}`,
          source: ContributionSource.library_submission,
          knowledgeItemId: item.id,
        },
      });

      await tx.contributionLedger.create({
        data: {
          userId: item.contributorId,
          eventId: event.id,
          type: LedgerTransactionType.earned,
          status: LedgerStatus.pending,
          hours: curateResourceRule.hours,
        },
      });
    }

    return result;
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
export async function flagKnowledgeItem(
  id: string,
  reason: string,
): Promise<{ id: string; status: KnowledgeStatus }> {
  const item = await db.knowledgeItem.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!item) throw new KnowledgeItemError(404, "Resource not found.");
  if (item.status !== KnowledgeStatus.published) {
    throw new KnowledgeItemError(400, "Only a published resource can be flagged.");
  }

  return db.knowledgeItem.update({
    where: { id },
    data: { status: KnowledgeStatus.flagged, flagReason: reason },
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
    data: {
      status: action === "remove" ? KnowledgeStatus.rejected : KnowledgeStatus.published,
      flagReason: null,
    },
    select: { id: true, status: true },
  });
}
