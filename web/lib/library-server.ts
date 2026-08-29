import "server-only";
import sanitizeHtml from "sanitize-html";
import { db } from "@/lib/db";
import {
  uploadKnowledgeDocument,
  getKnowledgeDocumentUrl,
  deleteKnowledgeDocument,
  uploadKnowledgeItemHeroImage,
  getKnowledgeItemHeroImageUrl,
  deleteKnowledgeItemHeroImage,
  getProfileAvatarUrl,
  UploadValidationError,
} from "@/lib/storage";
import { searchLibraryDocuments } from "@/lib/meilisearch";
import {
  NotificationType,
  KnowledgeContentType,
  KnowledgeLevel,
  KnowledgeStatus,
  KnowledgeVisibility,
  Role,
  ContributionSource,
  LedgerStatus,
  LedgerTransactionType,
  PastedImageOwnerType,
} from "@/lib/generated/prisma/enums";
import type { Prisma } from "@/lib/generated/prisma/client";
import { DIRECTORY_TIERS } from "@/lib/members";
import type { UserModel } from "@/lib/generated/prisma/models/User";
import { createNotification } from "@/lib/notifications-server";
import { recordAdminAction } from "@/lib/audit-server";
import { countPastedImageReferences, linkPastedImages, MAX_PASTED_IMAGES_PER_BODY } from "@/lib/pasted-images-server";
import { LIBRARY_FORUM_SLUG } from "@/lib/forums";
import { sendLibraryInviteEmail, sendLibraryLifecycleEmail } from "@/lib/email";
import {
  excerptFromHtml,
  type KnowledgeCategoryOption,
  type KnowledgeCategoryWithCount,
  type KnowledgeItemDetail,
  type KnowledgeItemForEdit,
  type KnowledgeItemRosterMember,
  type KnowledgeTagOption,
  type LibraryCard,
  type LibrarySort,
  type MySubmission,
  type ReviewQueueItem,
} from "@/lib/library";

// Absolute, not relative — same rationale as events-server.ts's createEvent:
// lib/linkify.tsx's linkifyText only turns absolute http(s) URLs into links.
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";

// blog_post's KnowledgeItem.body is rendered back via dangerouslySetInnerHTML
// on /library/[id] (ResourcePreview) for every viewer, not just the author —
// TiptapEditor's toolbar/schema is a UI affordance, not a trust boundary,
// since createKnowledgeItem/updateKnowledgeItem are ordinary API routes any
// client can call directly with an arbitrary `body` string. Strips every tag
// except the ones StarterKit's schema (plus the Image extension) can
// actually produce (bold/italic/strike/code marks, headings, lists,
// blockquote, hr, code block, img) and every attribute except img's src/alt
// (StarterKit itself never emits an attribute), which also eliminates
// on*= handlers and javascript: URLs without needing a general URL/
// attribute allowlist.
const BLOG_POST_ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "s",
  "strike",
  "code",
  "pre",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "blockquote",
  "hr",
  "img",
];

// The only src an <img> in a blog_post body is ever allowed to keep —
// same-origin proxy path returned by uploadLibraryBodyImage's
// getLibraryBodyImageUrl (lib/storage.ts). This is the real trust boundary
// against a direct API call: the editor's Image extension only ever
// inserts a src from our own upload endpoint, but the API itself has to
// enforce that independently since it accepts arbitrary HTML.
const LIBRARY_BODY_IMAGE_SRC_PREFIX = "/api/library/body-image/";

export function sanitizeBlogPostBody(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: BLOG_POST_ALLOWED_TAGS,
    allowedAttributes: { img: ["src", "alt"] },
    exclusiveFilter: (frame) =>
      frame.tag === "img" && !frame.attribs.src?.startsWith(LIBRARY_BODY_IMAGE_SRC_PREFIX),
  });
}

const LIBRARY_CARD_SELECT = {
  id: true,
  title: true,
  description: true,
  contentType: true,
  level: true,
  status: true,
  visibility: true,
  createdAt: true,
  youtubeUrl: true,
  heroImageUrl: true,
  externalUrl: true,
  categories: { select: { category: { select: { name: true, slug: true } } } },
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
  visibility: KnowledgeVisibility;
  createdAt: Date;
  youtubeUrl: string | null;
  heroImageUrl: string | null;
  externalUrl: string | null;
  categories: { category: { name: string; slug: string } }[];
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
    visibility: item.visibility,
    categories: item.categories.map(({ category }) => category),
    contributor: item.contributor,
    createdAt: item.createdAt.toISOString(),
    youtubeUrl: item.youtubeUrl,
    // Custom cover image, if the contributor uploaded one — null falls
    // back to the video's YouTube thumbnail in every renderer (browse
    // card, detail page, feed), not resolved here since those already
    // have their own youtubeThumbnailUrl(youtubeUrl) fallback logic.
    heroImageUrl: getKnowledgeItemHeroImageUrl(item.heroImageUrl),
    externalUrl: item.externalUrl,
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

/**
 * Same category list as getKnowledgeCategories, with a per-category count of
 * published/flagged items visible to this user — powers the /library filter
 * chips' item-count hint. Kept separate since the submit/edit forms that
 * call getKnowledgeCategories have no userId/visibility context to scope
 * counts by, and don't need one.
 */
export async function getKnowledgeCategoriesWithCounts(params: {
  userId: string;
  isPrivileged: boolean;
}): Promise<KnowledgeCategoryWithCount[]> {
  const visibleStatuses = [KnowledgeStatus.published, KnowledgeStatus.flagged];
  const visibilityFilter = params.isPrivileged
    ? {}
    : {
        OR: [
          { visibility: KnowledgeVisibility.public },
          { contributorId: params.userId },
          { invitees: { some: { userId: params.userId } } },
        ],
      };

  const [categories, counts] = await Promise.all([
    db.knowledgeCategory.findMany({ orderBy: { name: "asc" } }),
    db.knowledgeItemCategory.groupBy({
      by: ["categoryId"],
      where: { knowledgeItem: { status: { in: visibleStatuses }, ...visibilityFilter } },
      _count: { _all: true },
    }),
  ]);

  const countByCategory = new Map(counts.map((row) => [row.categoryId, row._count._all]));
  return categories.map((category) => ({ ...category, count: countByCategory.get(category.id) ?? 0 }));
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
 *
 * Restricted Knowledge Library Submissions, Objective 03: `visibility`/
 * `invitedUserIds` mirror createEvent's restricted-audience handling —
 * invitees are re-resolved against the same DIRECTORY_TIERS +
 * listInDirectory eligibility (belt-and-suspenders against
 * createKnowledgeItemSchema's own invariant), the contributor is excluded
 * (already implicitly "in" as the submitter), and KnowledgeItemInvitee rows
 * are created in the same write as the item. Unlike createEvent, no
 * notification/email is sent here — the item is pending_review and
 * invisible to everyone (including invitees) until a Steward publishes it,
 * so notifying now would point at content invitees can't see yet
 * (deferred to Objective 05).
 */
export async function createKnowledgeItem(
  contributorId: string,
  input: {
    title: string;
    description: string;
    body: string | null;
    contentType: KnowledgeContentType;
    level: KnowledgeLevel;
    categoryIds: string[];
    tagIds: string[];
    youtubeUrl: string | null;
    externalUrl: string | null;
    deidentificationConfirmed: boolean;
    licenseConsented: boolean;
    visibility: KnowledgeVisibility;
    invitedUserIds: string[];
    file: File | null;
    heroImage: File | null;
  },
): Promise<{ id: string }> {
  if (!input.licenseConsented) {
    throw new KnowledgeItemError(400, "You must acknowledge the content licensing terms to submit.");
  }
  if (input.contentType === KnowledgeContentType.case_study && !input.deidentificationConfirmed) {
    throw new KnowledgeItemError(400, "You must confirm all patient information has been de-identified.");
  }
  const isBlogPost = input.contentType === KnowledgeContentType.blog_post;
  if (isBlogPost && !input.body?.trim()) {
    throw new KnowledgeItemError(400, "Write your post before submitting.");
  }
  // Sanitized once here (rather than inline at the db.create below) so both
  // the stored body and the excerpt derived from it below share one
  // sanitized value — a body that's nothing but disallowed markup (e.g.
  // just a <script> tag) collapses to empty and re-triggers the same
  // "write your post" rejection, instead of silently saving a blank post.
  const sanitizedBody = isBlogPost ? sanitizeBlogPostBody(input.body ?? "") : null;
  if (isBlogPost && !sanitizedBody?.trim()) {
    throw new KnowledgeItemError(400, "Write your post before submitting.");
  }
  if (
    isBlogPost &&
    countPastedImageReferences(sanitizedBody ?? "", PastedImageOwnerType.library_item) > MAX_PASTED_IMAGES_PER_BODY
  ) {
    throw new KnowledgeItemError(400, `A post can reference at most ${MAX_PASTED_IMAGES_PER_BODY} pasted images.`);
  }

  const isRestricted = input.visibility === KnowledgeVisibility.restricted;
  const invitedUsers = isRestricted
    ? await db.user.findMany({
        where: {
          id: { in: input.invitedUserIds, notIn: [contributorId] },
          tier: { in: DIRECTORY_TIERS },
          profile: { listInDirectory: true },
        },
        select: { id: true },
      })
    : [];
  if (isRestricted && invitedUsers.length === 0) {
    throw new KnowledgeItemError(400, "Select at least one member to invite.");
  }

  const categories = await db.knowledgeCategory.findMany({
    where: { id: { in: input.categoryIds } },
    select: { id: true },
  });
  if (categories.length !== input.categoryIds.length) {
    throw new KnowledgeItemError(400, "Select at least one valid category.");
  }

  const isRecordedLecture = input.contentType === KnowledgeContentType.recorded_lecture;
  if (isRecordedLecture && !input.youtubeUrl) {
    throw new KnowledgeItemError(400, "A YouTube URL is required for a recorded lecture.");
  }
  const requiresAttachmentOrLink = !isRecordedLecture && !isBlogPost;
  if (requiresAttachmentOrLink && input.file && input.externalUrl) {
    throw new KnowledgeItemError(400, "Choose either a file upload or an external link, not both.");
  }
  if (requiresAttachmentOrLink && !input.file && !input.externalUrl) {
    throw new KnowledgeItemError(400, "A file upload or external link is required for this content type.");
  }

  let attachment: { objectKey: string; fileName: string; mimeType: string; sizeBytes: number } | null = null;
  if (requiresAttachmentOrLink && input.file) {
    try {
      attachment = await uploadKnowledgeDocument(input.file);
    } catch (error) {
      if (error instanceof UploadValidationError) {
        throw new KnowledgeItemError(400, error.message);
      }
      throw error;
    }
  }

  // Optional cover image, any content type — for a recorded_lecture, this
  // is purely an override: leaving it unset isn't a missing-data state,
  // every renderer falls back to the video's own YouTube thumbnail.
  let heroImageUrl: string | null = null;
  if (input.heroImage) {
    try {
      heroImageUrl = await uploadKnowledgeItemHeroImage(input.heroImage);
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
      // blog_post has no separate excerpt input — same "derive it from the
      // body" UX as Blog's Post.body/excerpt split.
      description: isBlogPost ? excerptFromHtml(sanitizedBody ?? "") : input.description,
      body: sanitizedBody,
      contentType: input.contentType,
      level: input.level,
      contributorId,
      youtubeUrl: isRecordedLecture ? input.youtubeUrl : null,
      heroImageUrl,
      externalUrl: requiresAttachmentOrLink ? input.externalUrl : null,
      deidentificationConfirmed: input.deidentificationConfirmed,
      licenseConsented: true,
      status: KnowledgeStatus.pending_review,
      visibility: input.visibility,
      categories: { create: input.categoryIds.map((categoryId) => ({ categoryId })) },
      tags: { create: input.tagIds.map((tagId) => ({ tagId })) },
      attachments: attachment ? { create: [attachment] } : undefined,
      invitees: invitedUsers.length > 0 ? { create: invitedUsers.map((user) => ({ userId: user.id })) } : undefined,
    },
    select: { id: true },
  });

  if (isBlogPost) {
    await linkPastedImages({
      ownerType: PastedImageOwnerType.library_item,
      ownerId: item.id,
      uploaderId: contributorId,
      body: sanitizedBody ?? "",
    });
  }

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
      body: true,
      contentType: true,
      level: true,
      status: true,
      categories: { select: { categoryId: true } },
      youtubeUrl: true,
      heroImageUrl: true,
      externalUrl: true,
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
    body: item.body,
    contentType: item.contentType,
    level: item.level,
    status: item.status,
    categoryIds: item.categories.map(({ categoryId }) => categoryId),
    tagIds: item.tags.map(({ tagId }) => tagId),
    youtubeUrl: item.youtubeUrl,
    heroImageUrl: getKnowledgeItemHeroImageUrl(item.heroImageUrl),
    externalUrl: item.externalUrl,
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
    body: string | null;
    contentType: KnowledgeContentType;
    level: KnowledgeLevel;
    categoryIds: string[];
    tagIds: string[];
    youtubeUrl: string | null;
    externalUrl: string | null;
    deidentificationConfirmed: boolean;
    file: File | null;
    heroImage: File | null;
  },
): Promise<{ id: string; status: KnowledgeStatus }> {
  const item = await db.knowledgeItem.findUnique({
    where: { id },
    select: {
      id: true,
      contributorId: true,
      status: true,
      heroImageUrl: true,
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
  const isBlogPost = input.contentType === KnowledgeContentType.blog_post;
  if (isBlogPost && !input.body?.trim()) {
    throw new KnowledgeItemError(400, "Write your post before submitting.");
  }
  const sanitizedBody = isBlogPost ? sanitizeBlogPostBody(input.body ?? "") : null;
  if (isBlogPost && !sanitizedBody?.trim()) {
    throw new KnowledgeItemError(400, "Write your post before submitting.");
  }
  if (
    isBlogPost &&
    countPastedImageReferences(sanitizedBody ?? "", PastedImageOwnerType.library_item) > MAX_PASTED_IMAGES_PER_BODY
  ) {
    throw new KnowledgeItemError(400, `A post can reference at most ${MAX_PASTED_IMAGES_PER_BODY} pasted images.`);
  }

  const categories = await db.knowledgeCategory.findMany({
    where: { id: { in: input.categoryIds } },
    select: { id: true },
  });
  if (categories.length !== input.categoryIds.length) {
    throw new KnowledgeItemError(400, "Select at least one valid category.");
  }

  const isRecordedLecture = input.contentType === KnowledgeContentType.recorded_lecture;
  if (isRecordedLecture && !input.youtubeUrl) {
    throw new KnowledgeItemError(400, "A YouTube URL is required for a recorded lecture.");
  }
  const requiresAttachmentOrLink = !isRecordedLecture && !isBlogPost;
  if (requiresAttachmentOrLink && input.file && input.externalUrl) {
    throw new KnowledgeItemError(400, "Choose either a file upload or an external link, not both.");
  }
  const existingAttachment = item.attachments[0] ?? null;
  if (requiresAttachmentOrLink && !input.file && !existingAttachment && !input.externalUrl) {
    throw new KnowledgeItemError(400, "A file upload or external link is required for this content type.");
  }

  let newAttachment: { objectKey: string; fileName: string; mimeType: string; sizeBytes: number } | null = null;
  if (requiresAttachmentOrLink && input.file) {
    try {
      newAttachment = await uploadKnowledgeDocument(input.file);
    } catch (error) {
      if (error instanceof UploadValidationError) {
        throw new KnowledgeItemError(400, error.message);
      }
      throw error;
    }
  }

  // Same "upload the replacement, then delete the old object afterward"
  // shape as updateEvent's heroImageUrl handling — a new upload replaces
  // whatever's there; no new file provided keeps the existing one as-is
  // (there's no separate "remove image" action, same as Event's hero image).
  let heroImageUrl = item.heroImageUrl;
  if (input.heroImage) {
    try {
      heroImageUrl = await uploadKnowledgeItemHeroImage(input.heroImage);
    } catch (error) {
      if (error instanceof UploadValidationError) {
        throw new KnowledgeItemError(400, error.message);
      }
      throw error;
    }
  }

  const nextStatus = item.status === KnowledgeStatus.rejected ? KnowledgeStatus.pending_review : item.status;
  // Drop the old attachment when it's being replaced by a new file, when
  // contentType moved to recorded_lecture/blog_post (neither stores an
  // attachment), or when the edit switches from a file to an external link.
  const dropsExistingAttachment =
    existingAttachment !== null &&
    (isRecordedLecture || isBlogPost || newAttachment !== null || (requiresAttachmentOrLink && input.externalUrl !== null));

  const updated = await db.$transaction(async (tx) => {
    await tx.knowledgeItemTag.deleteMany({ where: { knowledgeItemId: item.id } });
    await tx.knowledgeItemCategory.deleteMany({ where: { knowledgeItemId: item.id } });
    if (dropsExistingAttachment) {
      await tx.knowledgeAttachment.delete({ where: { id: existingAttachment!.id } });
    }
    const result = await tx.knowledgeItem.update({
      where: { id: item.id },
      data: {
        title: input.title,
        description: isBlogPost ? excerptFromHtml(sanitizedBody ?? "") : input.description,
        body: sanitizedBody,
        contentType: input.contentType,
        level: input.level,
        youtubeUrl: isRecordedLecture ? input.youtubeUrl : null,
        heroImageUrl,
        externalUrl: requiresAttachmentOrLink ? input.externalUrl : null,
        deidentificationConfirmed: input.deidentificationConfirmed,
        status: nextStatus,
        categories: { create: input.categoryIds.map((categoryId) => ({ categoryId })) },
        tags: { create: input.tagIds.map((tagId) => ({ tagId })) },
        attachments: newAttachment ? { create: [newAttachment] } : undefined,
      },
      select: { id: true, status: true },
    });
    // Keep the on-demand discussion thread's title (set from item.title at
    // creation in startKnowledgeItemDiscussion) in sync with renames — a
    // no-op updateMany when no thread has been started yet.
    await tx.forumThread.updateMany({
      where: { knowledgeItemId: item.id },
      data: { title: input.title },
    });
    return result;
  });

  if (input.heroImage && item.heroImageUrl) {
    await deleteKnowledgeItemHeroImage(item.heroImageUrl);
  }

  if (dropsExistingAttachment) {
    await deleteKnowledgeDocument(existingAttachment!.objectKey);
  }

  if (isBlogPost) {
    await linkPastedImages({
      ownerType: PastedImageOwnerType.library_item,
      ownerId: updated.id,
      uploaderId: actingUser.id,
      body: sanitizedBody ?? "",
    });
  }

  return updated;
}

/**
 * Deletes a submission (§4.9) and everything attached to it — contributor or
 * Library Steward/admin only, same ownership rule as updateKnowledgeItem.
 * KnowledgeAttachment/categories/tags/invitees/views/legacyBlogSlugs cascade
 * via the schema; ForumThread does not (no onDelete clause) and is hard-
 * deleted here, per the confirmed UX ("delete the discussion, not just
 * detach it") — its own ForumPost/ForumThreadInvitee/ThreadView rows then
 * cascade off the thread. ContributionEvent and ReviewItem.publishedKnowledgeItemId
 * also lack a cascade and are deliberately *not* deleted: nulling the FK
 * keeps a contributor's already-earned Knowledge Hours record and a
 * peer-review item's history intact after the Library item they produced is
 * removed. MinIO objects and the Meilisearch doc aren't touched by the DB
 * transaction — cleaned up by the caller/below, same two-step order as
 * updateKnowledgeItem's hero-image/attachment cleanup above.
 */
export async function deleteKnowledgeItem(itemId: string, actingUser: UserModel): Promise<void> {
  const item = await db.knowledgeItem.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      title: true,
      contributorId: true,
      heroImageUrl: true,
      attachments: { select: { objectKey: true } },
      forumThread: { select: { id: true } },
    },
  });
  if (!item) throw new KnowledgeItemError(404, "Resource not found.");

  const isPrivileged = actingUser.role === Role.admin || actingUser.role === Role.moderator;
  if (!isPrivileged && item.contributorId !== actingUser.id) {
    throw new KnowledgeItemError(403, "Only the submitter or a Library Steward/admin can delete this resource.");
  }

  // Unlike resolveFlaggedKnowledgeItem's "remove" (a status flip, row kept),
  // this is a hard delete — the row won't exist to join against afterward,
  // so the log entry is the only surviving record this item ever existed.
  // Logged for every caller, not just self-deletes: a privileged delete of
  // someone else's item had zero audit trail before this too.
  const isSelfDelete = item.contributorId === actingUser.id;

  await db.$transaction(async (tx) => {
    if (item.forumThread) {
      await tx.forumThread.delete({ where: { id: item.forumThread.id } });
    }
    await tx.contributionEvent.updateMany({ where: { knowledgeItemId: item.id }, data: { knowledgeItemId: null } });
    await tx.reviewItem.updateMany({
      where: { publishedKnowledgeItemId: item.id },
      data: { publishedKnowledgeItemId: null },
    });
    await tx.knowledgeItem.delete({ where: { id: item.id } });
    await recordAdminAction(
      {
        actorId: actingUser.id,
        action: isSelfDelete ? "content.self_deleted" : "content.deleted",
        entityType: "KnowledgeItem",
        entityId: item.id,
        metadata: { title: item.title, contributorId: item.contributorId },
      },
      tx,
    );
  });

  for (const attachment of item.attachments) {
    await deleteKnowledgeDocument(attachment.objectKey);
  }
  await deleteKnowledgeItemHeroImage(item.heroImageUrl);
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
  /**
   * Community-based-categorization initiative, objective 3. Applied on top
   * of categorySlug (redundant but harmless when both are set — a specific
   * category already implies its community) — see
   * getDefaultCommunityFilter in lib/profile-server.ts for how callers
   * derive this (explicit ?community= selection, or the member's own
   * communities as the default when neither is picked).
   */
  communityIds?: string[];
  q?: string;
  sort?: LibrarySort;
  userId: string;
  isPrivileged: boolean;
}): Promise<LibraryCard[]> {
  const visibleStatuses = [KnowledgeStatus.published, KnowledgeStatus.flagged];
  const communityFilter = params.communityIds?.length
    ? { categories: { some: { category: { communityId: { in: params.communityIds } } } } }
    : {};
  const filters = {
    ...(params.contentType ? { contentType: params.contentType } : {}),
    ...(params.level ? { level: params.level } : {}),
    ...(params.categorySlug ? { categories: { some: { category: { slug: params.categorySlug } } } } : {}),
    ...communityFilter,
  };
  const visibilityFilter = params.isPrivileged
    ? {}
    : {
        OR: [
          { visibility: KnowledgeVisibility.public },
          { contributorId: params.userId },
          { invitees: { some: { userId: params.userId } } },
        ],
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
      where: {
        id: { in: hits.map((hit) => hit.id) },
        status: { in: visibleStatuses },
        ...communityFilter,
        ...visibilityFilter,
      },
      select: LIBRARY_CARD_SELECT,
    });
    const byId = new Map(items.map((item) => [item.id, item]));
    const cards = hits.map((hit) => byId.get(hit.id)).filter((item) => item != null).map(toLibraryCard);
    return sortLibraryCards(cards, sort);
  }

  const items = await db.knowledgeItem.findMany({
    where: { status: { in: visibleStatuses }, ...filters, ...visibilityFilter },
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
export async function getPublishedKnowledgeItemById(
  id: string,
  userId: string,
  isPrivileged: boolean,
): Promise<KnowledgeItemDetail | null> {
  const item = await db.knowledgeItem.findFirst({
    where: {
      id,
      status: { in: [KnowledgeStatus.published, KnowledgeStatus.flagged] },
      ...(isPrivileged
        ? {}
        : {
            OR: [
              { visibility: KnowledgeVisibility.public },
              { contributorId: userId },
              { invitees: { some: { userId } } },
            ],
          }),
    },
    select: {
      ...LIBRARY_CARD_SELECT,
      // Overrides LIBRARY_CARD_SELECT's plain {name, slug} categories
      // select — only the detail page needs each category's Community too.
      categories: { select: { category: { select: { name: true, slug: true, community: { select: { name: true } } } } } },
      body: true,
      deidentificationConfirmed: true,
      tags: { select: { tag: { select: { name: true, slug: true } } } },
      forumThread: { select: { id: true, _count: { select: { posts: true } } } },
      contributionEvent: { select: { id: true } },
      _count: { select: { views: true } },
    },
  });
  if (!item) return null;

  return {
    ...toLibraryCard(item),
    categories: item.categories.map(({ category }) => ({
      name: category.name,
      slug: category.slug,
      communityName: category.community.name,
    })),
    body: item.body,
    deidentificationConfirmed: item.deidentificationConfirmed,
    tags: item.tags.map(({ tag }) => tag),
    forumThreadId: item.forumThread?.id ?? null,
    forumReplyCount: item.forumThread ? item.forumThread._count.posts - 1 : null,
    viewCount: item._count.views,
    hasEarnedHours: item.contributionEvent !== null,
  };
}

/**
 * Full per-person invited-member roster for a restricted item's detail page
 * (Restricted Knowledge Library Submissions, Objective 05) — every invited
 * member, no RSVP-equivalent to join against (see KnowledgeItemRosterMember's
 * doc comment). Caller enforces the access gate, same "caller enforces"
 * convention as getEventRoster — the page only calls this for a restricted
 * item it has already confirmed the viewer can see via
 * getPublishedKnowledgeItemById.
 */
export async function getKnowledgeItemRoster(knowledgeItemId: string): Promise<KnowledgeItemRosterMember[]> {
  const invitees = await db.knowledgeItemInvitee.findMany({
    where: { knowledgeItemId },
    select: {
      userId: true,
      user: { select: { name: true, profile: { select: { avatarUrl: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });

  return invitees.map((invitee) => ({
    userId: invitee.userId,
    name: invitee.user.name,
    avatarUrl: getProfileAvatarUrl(invitee.user.profile?.avatarUrl ?? null),
  }));
}

/**
 * Bell-notifies invitees that a restricted item is now visible to them
 * (Restricted Knowledge Library Submissions, Objective 05) — reused by
 * reviewKnowledgeItem's publish branch (every current invitee, first time
 * the item becomes visible) and updateKnowledgeItemInvitees (a newly-added
 * invitee on an already-visible item), same "shared helper, two call
 * sites" precedent as events-server.ts's notifyInvitedUsers. Takes a
 * transaction client so callers can post it alongside other writes in the
 * same transaction.
 */
async function notifyInvitedLibraryUsers(
  tx: Prisma.TransactionClient,
  params: { knowledgeItemId: string; title: string; contributorName: string; userIds: string[] },
): Promise<void> {
  if (params.userIds.length === 0) return;
  const link = `/library/${params.knowledgeItemId}`;
  const message = `${params.contributorName} shared "${params.title}" with you in the Knowledge Library.`;
  await tx.notification.createMany({
    data: params.userIds.map((userId) => ({
      recipientId: userId,
      type: NotificationType.library_item_shared,
      message,
      link,
    })),
  });
}

/**
 * Emails invitees the same "shared with you" copy, best-effort — reused by
 * reviewKnowledgeItem and updateKnowledgeItemInvitees, same split as
 * notifyInvitedLibraryUsers.
 */
async function emailInvitedLibraryUsers(
  users: { email: string; name: string | null }[],
  params: { knowledgeItemId: string; title: string; contributorName: string },
): Promise<void> {
  if (users.length === 0) return;
  const link = `${APP_URL}/library/${params.knowledgeItemId}`;
  await Promise.allSettled(
    users.map((user) =>
      sendLibraryInviteEmail(user.email, user.name ?? "there", {
        contributorName: params.contributorName,
        title: params.title,
        link,
      }),
    ),
  );
}

/**
 * PATCH /api/library/:id/invitees — adds and/or removes members from a
 * restricted item's invited list after submission (Restricted Knowledge
 * Library Submissions, Objective 05), mirrors updateEventInvitees. Both
 * add and remove notifications are gated on the item already being
 * visible (published/flagged) — a still-pending_review item's invited
 * list changes silently either way, since nothing is visible to notify
 * anyone *about* yet (same rationale as createKnowledgeItem's doc comment:
 * notifying about content invitees can't see would be worse than useless,
 * it'd leak the existence of an unreviewed submission). reviewKnowledgeItem's
 * publish branch is the sole "first time visible" notification site.
 */
export async function updateKnowledgeItemInvitees(
  itemId: string,
  actingUser: UserModel,
  input: { addUserIds: string[]; removeUserIds: string[] },
): Promise<{ added: number; removed: number }> {
  const item = await db.knowledgeItem.findUnique({
    where: { id: itemId },
    select: { id: true, title: true, status: true, visibility: true, contributorId: true },
  });
  if (!item) throw new KnowledgeItemError(404, "Resource not found.");
  if (item.visibility !== KnowledgeVisibility.restricted) {
    throw new KnowledgeItemError(400, "Only a restricted item has an invited list.");
  }

  const isPrivileged = actingUser.role === Role.admin || actingUser.role === Role.moderator;
  const isContributor = actingUser.id === item.contributorId;
  if (!isPrivileged && !isContributor) {
    throw new KnowledgeItemError(403, "Only the submitter or a Library Steward/admin can manage invitees.");
  }

  const contributor = await db.user.findUnique({ where: { id: item.contributorId }, select: { name: true } });
  const contributorName = contributor?.name ?? "A member";

  // Re-resolved against directory eligibility, same rationale as
  // createKnowledgeItem — ids that aren't eligible (or already invited, or
  // the contributor) are silently dropped rather than erroring.
  const [addCandidates, alreadyInvited, removeCandidates] = await Promise.all([
    input.addUserIds.length > 0
      ? db.user.findMany({
          where: {
            id: { in: input.addUserIds, notIn: [item.contributorId] },
            tier: { in: DIRECTORY_TIERS },
            profile: { listInDirectory: true },
          },
          select: { id: true, email: true, name: true },
        })
      : Promise.resolve([]),
    input.addUserIds.length > 0
      ? db.knowledgeItemInvitee.findMany({
          where: { knowledgeItemId: itemId, userId: { in: input.addUserIds } },
          select: { userId: true },
        })
      : Promise.resolve([]),
    input.removeUserIds.length > 0
      ? db.knowledgeItemInvitee.findMany({
          where: { knowledgeItemId: itemId, userId: { in: input.removeUserIds } },
          select: { userId: true, user: { select: { email: true, name: true } } },
        })
      : Promise.resolve([]),
  ]);
  const alreadyInvitedIds = new Set(alreadyInvited.map((row) => row.userId));
  const newInvitees = addCandidates.filter((user) => !alreadyInvitedIds.has(user.id));
  const itemIsVisible = item.status === KnowledgeStatus.published || item.status === KnowledgeStatus.flagged;

  await db.$transaction(async (tx) => {
    if (newInvitees.length > 0) {
      await tx.knowledgeItemInvitee.createMany({
        data: newInvitees.map((user) => ({ knowledgeItemId: itemId, userId: user.id })),
      });
      if (itemIsVisible) {
        await notifyInvitedLibraryUsers(tx, {
          knowledgeItemId: itemId,
          title: item.title,
          contributorName,
          userIds: newInvitees.map((user) => user.id),
        });
      }
    }

    if (removeCandidates.length > 0) {
      const removeIds = removeCandidates.map((row) => row.userId);
      await tx.knowledgeItemInvitee.deleteMany({ where: { knowledgeItemId: itemId, userId: { in: removeIds } } });

      if (itemIsVisible) {
        const message = `You no longer have access to "${item.title}" in the Knowledge Library.`;
        await tx.notification.createMany({
          data: removeIds.map((userId) => ({
            recipientId: userId,
            type: NotificationType.library_item_removed,
            message,
            // No link: a removed invitee loses access to the item's
            // detail page, so a stored link would 404. Informational-only,
            // same rationale as event_removed.
            link: null,
          })),
        });
      }
    }
  });

  // Best-effort, same rationale as every other email call in this file —
  // the DB rows already reflect the new invited list by this point.
  await Promise.all([
    itemIsVisible
      ? emailInvitedLibraryUsers(newInvitees, { knowledgeItemId: itemId, title: item.title, contributorName })
      : Promise.resolve(),
    itemIsVisible && removeCandidates.length > 0
      ? Promise.allSettled(
          removeCandidates.map((row) =>
            sendLibraryLifecycleEmail(row.user.email, row.user.name ?? "there", {
              subject: `Update: ${item.title}`,
              message: `You no longer have access to "${item.title}" in the Knowledge Library.`,
              // No link — same rationale as the in-app notification above.
            }),
          ),
        )
      : Promise.resolve(),
  ]);

  return { added: newInvitees.length, removed: removeCandidates.length };
}

export async function getKnowledgeItemViewCount(knowledgeItemId: string): Promise<number> {
  return db.knowledgeItemView.count({ where: { knowledgeItemId } });
}

/**
 * Action-level visibility re-check for a restricted item (Authorization
 * re-checks, Objective 08) — mirrors the exact OR-shape
 * getPublishedKnowledgeItemById's read path already gates on (Objective 04):
 * public, the contributor, an invitee, or Steward/admin. Every action route
 * below that takes an item id from an untrusted caller re-checks this
 * independently rather than trusting that the page itself only ever renders
 * the button for someone who can see the item — same "every action route
 * re-checks independently" convention rsvpToEvent/startEventDiscussion
 * already follow for restricted events.
 */
export function canViewKnowledgeItem(
  item: { visibility: KnowledgeVisibility; contributorId: string; invitees: { userId: string }[] },
  actingUser: UserModel,
): boolean {
  const isPrivileged = actingUser.role === Role.admin || actingUser.role === Role.moderator;
  return (
    item.visibility === KnowledgeVisibility.public ||
    item.contributorId === actingUser.id ||
    item.invitees.some((invitee) => invitee.userId === actingUser.id) ||
    isPrivileged
  );
}

/**
 * Records a unique visit to a resource's detail page for the eye-icon
 * count, called from POST /api/library/:id/view on every page load. Mirrors
 * recordEventView — /library/[id] redirects a signed-out visitor to
 * /sign-in before this can ever fire, so `actingUser` is always a real
 * member and this dedupes on the `[knowledgeItemId, userId]` unique
 * constraint directly. 404s (not 403s) for a restricted item this viewer
 * can't see, same as the discussion/flag re-checks below, so a guessed id
 * doesn't confirm the item's existence.
 */
export async function recordKnowledgeItemView(knowledgeItemId: string, actingUser: UserModel): Promise<number> {
  const item = await db.knowledgeItem.findUnique({
    where: { id: knowledgeItemId },
    select: { id: true, visibility: true, contributorId: true, invitees: { select: { userId: true } } },
  });
  if (!item) throw new KnowledgeItemError(404, "Resource not found.");
  if (!canViewKnowledgeItem(item, actingUser)) throw new KnowledgeItemError(404, "Resource not found.");

  await db.knowledgeItemView.createMany({ data: { knowledgeItemId, userId: actingUser.id }, skipDuplicates: true });
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
  actingUser: UserModel,
): Promise<{ threadId: string }> {
  const item = await db.knowledgeItem.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      title: true,
      status: true,
      visibility: true,
      contributorId: true,
      invitees: { select: { userId: true } },
      forumThread: { select: { id: true } },
    },
  });
  if (!item) throw new KnowledgeItemError(404, "Resource not found.");
  if (!canViewKnowledgeItem(item, actingUser)) throw new KnowledgeItemError(404, "Resource not found.");
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
      data: { forumId: forum.id, authorId: actingUser.id, title: item.title, knowledgeItemId: item.id },
      select: { id: true },
    });
    await tx.forumPost.create({
      data: {
        threadId: created.id,
        authorId: actingUser.id,
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
export async function getPublishedKnowledgeItemsByContributor(
  contributorId: string,
  viewerId: string,
  isPrivileged: boolean,
): Promise<LibraryCard[]> {
  const items = await db.knowledgeItem.findMany({
    where: {
      contributorId,
      status: { in: [KnowledgeStatus.published, KnowledgeStatus.flagged] },
      ...(isPrivileged
        ? {}
        : {
            OR: [
              { visibility: KnowledgeVisibility.public },
              { contributorId: viewerId },
              { invitees: { some: { userId: viewerId } } },
            ],
          }),
    },
    select: LIBRARY_CARD_SELECT,
    orderBy: { createdAt: "desc" },
  });
  return items.map(toLibraryCard);
}


const TRENDING_WINDOW_DAYS = 30;

/**
 * Dashboard "What's Trending" — library items with the most views in the
 * last 30 days. Gated the same way as getPublishedKnowledgeItemById: a
 * `public` item is visible to everyone, a `restricted` item only to its
 * contributor/invitees, and isPrivileged (admin/moderator) bypasses the gate
 * entirely.
 */
export async function getTrendingLibraryItems(
  userId: string,
  isPrivileged: boolean,
  limit = 3,
): Promise<{ id: string; title: string; contentType: KnowledgeContentType; viewCount: number }[]> {
  const since = new Date(Date.now() - TRENDING_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const grouped = await db.knowledgeItemView.groupBy({
    by: ["knowledgeItemId"],
    where: { createdAt: { gte: since } },
    _count: { knowledgeItemId: true },
    orderBy: { _count: { knowledgeItemId: "desc" } },
    take: limit,
  });
  if (grouped.length === 0) return [];

  const items = await db.knowledgeItem.findMany({
    where: {
      id: { in: grouped.map((group) => group.knowledgeItemId) },
      status: { in: [KnowledgeStatus.published, KnowledgeStatus.flagged] },
      ...(isPrivileged
        ? {}
        : {
            OR: [
              { visibility: KnowledgeVisibility.public },
              { contributorId: userId },
              { invitees: { some: { userId } } },
            ],
          }),
    },
    select: { id: true, title: true, contentType: true },
  });
  const byId = new Map(items.map((item) => [item.id, item]));

  return grouped.flatMap((group) => {
    const item = byId.get(group.knowledgeItemId);
    return item
      ? [{ id: item.id, title: item.title, contentType: item.contentType, viewCount: group._count.knowledgeItemId }]
      : [];
  });
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
      categories: { select: { category: { select: { name: true } } } },
      createdAt: true,
      contributionEvent: { select: { id: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return items.map(({ contributionEvent, ...item }) => ({
    ...item,
    categories: item.categories.map(({ category }) => category),
    createdAt: item.createdAt.toISOString(),
    hasEarnedHours: contributionEvent !== null,
  }));
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
      categories: { select: { category: { select: { name: true } } } },
      contributor: { select: { name: true, email: true } },
      deidentificationConfirmed: true,
      youtubeUrl: true,
      externalUrl: true,
      attachments: { select: { id: true, fileName: true, mimeType: true, sizeBytes: true, objectKey: true } },
      visibility: true,
      invitees: { select: { user: { select: { name: true } } } },
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return items.map((item) => ({
    ...item,
    categories: item.categories.map(({ category }) => category),
    invitees: item.invitees.map((invitee) => invitee.user),
    createdAt: item.createdAt.toISOString(),
  }));
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
    select: {
      id: true,
      title: true,
      status: true,
      contributorId: true,
      visibility: true,
      contributor: { select: { name: true } },
    },
  });
  if (!item) throw new KnowledgeItemError(404, "Resource not found.");
  if (item.status !== KnowledgeStatus.pending_review) {
    throw new KnowledgeItemError(400, `This resource is already ${item.status}.`);
  }

  const status = action === "publish" ? KnowledgeStatus.published : KnowledgeStatus.rejected;
  const contributorName = item.contributor.name ?? "A member";
  const curateResourceRule =
    action === "publish"
      ? await db.contributionRule.findUnique({ where: { activityKey: CURATE_RESOURCE_ACTIVITY_KEY } })
      : null;

  const { updated, invitees } = await db.$transaction(async (tx) => {
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

    // Restricted Knowledge Library Submissions, Objective 05: the sole
    // "new restricted submission" notification site, deferred from
    // creation (createKnowledgeItem's doc comment) since a pending_review
    // item is invisible to everyone, invitees included, until this
    // publish transition makes it visible for the first time. Read fresh
    // from the DB inside the transaction rather than trusting any
    // caller-supplied list.
    let notifiedInvitees: { userId: string; email: string; name: string | null }[] = [];
    if (action === "publish" && item.visibility === KnowledgeVisibility.restricted) {
      const currentInvitees = await tx.knowledgeItemInvitee.findMany({
        where: { knowledgeItemId: item.id },
        select: { userId: true, user: { select: { email: true, name: true } } },
      });
      notifiedInvitees = currentInvitees.map((invitee) => ({
        userId: invitee.userId,
        email: invitee.user.email,
        name: invitee.user.name,
      }));
      await notifyInvitedLibraryUsers(tx, {
        knowledgeItemId: item.id,
        title: item.title,
        contributorName,
        userIds: notifiedInvitees.map((invitee) => invitee.userId),
      });
    }

    return { updated: result, invitees: notifiedInvitees };
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

  if (invitees.length > 0) {
    await emailInvitedLibraryUsers(invitees, { knowledgeItemId: item.id, title: item.title, contributorName });
  }

  return updated;
}

/**
 * POST /api/library/:id/flag (§4.9) — community flagging. Only a currently
 * `published` item can be flagged (not pending_review/rejected, and not a
 * second time while already flagged) — a Steward resolves a flagged item
 * back to published or removes it, which is out of scope for this
 * objective (no admin tooling for it yet). Re-checks canViewKnowledgeItem
 * (Objective 08) before the status gate, same 404-not-403 rationale as
 * startKnowledgeItemDiscussion — a non-invitee flagging a restricted item's
 * guessed id shouldn't learn it exists.
 */
export async function flagKnowledgeItem(
  id: string,
  actingUser: UserModel,
  reason: string,
): Promise<{ id: string; status: KnowledgeStatus }> {
  const item = await db.knowledgeItem.findUnique({
    where: { id },
    select: { id: true, status: true, visibility: true, contributorId: true, invitees: { select: { userId: true } } },
  });
  if (!item) throw new KnowledgeItemError(404, "Resource not found.");
  if (!canViewKnowledgeItem(item, actingUser)) throw new KnowledgeItemError(404, "Resource not found.");
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
  adminId: string,
): Promise<{ id: string; status: KnowledgeStatus }> {
  const item = await db.knowledgeItem.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!item) throw new KnowledgeItemError(404, "Resource not found.");
  if (item.status !== KnowledgeStatus.flagged) {
    throw new KnowledgeItemError(400, "This resource is not currently flagged.");
  }

  return db.$transaction(async (tx) => {
    const updated = await tx.knowledgeItem.update({
      where: { id },
      data: {
        status: action === "remove" ? KnowledgeStatus.rejected : KnowledgeStatus.published,
        flagReason: null,
      },
      select: { id: true, status: true },
    });
    await recordAdminAction(
      {
        actorId: adminId,
        action: action === "remove" ? "content.removed" : "content.dismissed",
        entityType: "KnowledgeItem",
        entityId: id,
      },
      tx,
    );
    return updated;
  });
}
