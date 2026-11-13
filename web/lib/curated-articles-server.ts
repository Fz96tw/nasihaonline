import "server-only";
import { db } from "@/lib/db";
import { ArticleSourceKind, ExternalArticleStatus } from "@/lib/generated/prisma/enums";
import { recordAdminAction } from "@/lib/audit-server";
import { FROM_THE_WEB_FORUM_SLUG } from "@/lib/forums";
import { normalizeKeywords, normalizeArticleUrl } from "@/lib/curated-article-parse";
import { ArticleFetchError, cacheArticleImage, previewArticleFromUrl } from "@/lib/curated-article-fetch";
import { getCuratedArticleImageUrl, type ArticleSourceDto, type ExternalArticleDto } from "@/lib/curated-articles";
import type { ArticleSourceInput, CuratedArticleUpdateInput } from "@/lib/validation/curated-articles";

export class CuratedArticleError extends Error {
  constructor(
    public readonly status: 400 | 403 | 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

async function assertCommunitiesExist(communityIds: string[]): Promise<void> {
  if (communityIds.length === 0) return;
  const found = await db.community.count({ where: { id: { in: communityIds } } });
  if (found !== new Set(communityIds).size) throw new CuratedArticleError(400, "One of the selected communities no longer exists.");
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

export async function listArticleSources(): Promise<ArticleSourceDto[]> {
  const [sources, counts] = await Promise.all([
    db.articleSource.findMany({
      orderBy: [{ enabled: "desc" }, { name: "asc" }],
      include: { communities: { select: { communityId: true } } },
    }),
    db.externalArticle.groupBy({
      by: ["sourceId", "status"],
      where: { sourceId: { not: null }, status: { in: [ExternalArticleStatus.pending, ExternalArticleStatus.approved] } },
      _count: { _all: true },
    }),
  ]);
  const countOf = (sourceId: string, status: ExternalArticleStatus) =>
    counts.find((row) => row.sourceId === sourceId && row.status === status)?._count._all ?? 0;
  return sources.map((source) => ({
    id: source.id,
    name: source.name,
    kind: source.kind,
    url: source.url,
    includeKeywords: source.includeKeywords,
    excludeKeywords: source.excludeKeywords,
    enabled: source.enabled,
    communityIds: source.communities.map((c) => c.communityId),
    lastFetchedAt: source.lastFetchedAt?.toISOString() ?? null,
    lastSuccessAt: source.lastSuccessAt?.toISOString() ?? null,
    lastError: source.lastError,
    consecutiveFailures: source.consecutiveFailures,
    lastNewCount: source.lastNewCount,
    pendingCount: countOf(source.id, ExternalArticleStatus.pending),
    approvedCount: countOf(source.id, ExternalArticleStatus.approved),
  }));
}

function sourceData(input: ArticleSourceInput) {
  return {
    name: input.name,
    kind: input.kind as ArticleSourceKind,
    url: input.url.trim(),
    includeKeywords: normalizeKeywords(input.includeKeywords),
    excludeKeywords: normalizeKeywords(input.excludeKeywords),
    enabled: input.enabled,
  };
}

export async function createArticleSource(adminId: string, input: ArticleSourceInput): Promise<{ id: string }> {
  await assertCommunitiesExist(input.communityIds);
  const source = await db.$transaction(async (tx) => {
    const created = await tx.articleSource.create({
      data: { ...sourceData(input), communities: { create: input.communityIds.map((communityId) => ({ communityId })) } },
      select: { id: true },
    });
    await recordAdminAction(
      { actorId: adminId, action: "curated_articles.source_created", entityType: "ArticleSource", entityId: created.id, metadata: { name: input.name, url: input.url } },
      tx,
    );
    return created;
  });
  return source;
}

export async function updateArticleSource(id: string, adminId: string, input: ArticleSourceInput): Promise<void> {
  const existing = await db.articleSource.findUnique({ where: { id }, select: { url: true, kind: true } });
  if (!existing) throw new CuratedArticleError(404, "Source not found.");
  await assertCommunitiesExist(input.communityIds);
  const feedChanged = existing.url !== input.url.trim() || existing.kind !== input.kind;
  await db.$transaction(async (tx) => {
    await tx.articleSourceCommunity.deleteMany({ where: { sourceId: id } });
    await tx.articleSource.update({
      where: { id },
      data: {
        ...sourceData(input),
        // A different feed must not reuse the old one's conditional-GET validators.
        ...(feedChanged ? { etag: null, lastModified: null, lastError: null, consecutiveFailures: 0 } : {}),
        communities: { create: input.communityIds.map((communityId) => ({ communityId })) },
      },
    });
    await recordAdminAction(
      { actorId: adminId, action: "curated_articles.source_updated", entityType: "ArticleSource", entityId: id, metadata: { name: input.name, url: input.url } },
      tx,
    );
  });
}

export async function setArticleSourceEnabled(id: string, adminId: string, enabled: boolean): Promise<void> {
  const result = await db.articleSource.updateMany({ where: { id }, data: { enabled } });
  if (result.count === 0) throw new CuratedArticleError(404, "Source not found.");
  await recordAdminAction({
    actorId: adminId,
    action: enabled ? "curated_articles.source_enabled" : "curated_articles.source_disabled",
    entityType: "ArticleSource",
    entityId: id,
  });
}

/** Articles it already produced stay (their sourceId becomes null), so approved rows keep showing. */
export async function deleteArticleSource(id: string, adminId: string): Promise<void> {
  const source = await db.articleSource.findUnique({ where: { id }, select: { name: true, url: true } });
  if (!source) throw new CuratedArticleError(404, "Source not found.");
  await db.$transaction(async (tx) => {
    await tx.articleSource.delete({ where: { id } });
    await recordAdminAction(
      { actorId: adminId, action: "curated_articles.source_deleted", entityType: "ArticleSource", entityId: id, metadata: source },
      tx,
    );
  });
}

// ---------------------------------------------------------------------------
// Review queue
// ---------------------------------------------------------------------------

const ARTICLE_DTO_INCLUDE = {
  communities: { select: { communityId: true } },
  source: { select: { name: true } },
  forumThread: { select: { id: true, _count: { select: { posts: true } } } },
} as const;

type ArticleWithDtoRelations = {
  id: string;
  url: string;
  title: string;
  excerpt: string;
  sourceName: string;
  sourceId: string | null;
  publishedAt: Date | null;
  fetchedAt: Date;
  imageKey: string | null;
  status: ExternalArticleStatus;
  scheduledAt: Date | null;
  approvedAt: Date | null;
  communities: { communityId: string }[];
  source: { name: string } | null;
  forumThread: { id: string; _count: { posts: number } } | null;
};

function toArticleDto(article: ArticleWithDtoRelations): ExternalArticleDto {
  return {
    id: article.id,
    url: article.url,
    title: article.title,
    excerpt: article.excerpt,
    sourceName: article.sourceName,
    sourceId: article.sourceId,
    feedSourceName: article.source?.name ?? null,
    publishedAt: article.publishedAt?.toISOString() ?? null,
    fetchedAt: article.fetchedAt.toISOString(),
    imageUrl: getCuratedArticleImageUrl(article.imageKey),
    status: article.status,
    scheduledAt: article.scheduledAt?.toISOString() ?? null,
    approvedAt: article.approvedAt?.toISOString() ?? null,
    communityIds: article.communities.map((c) => c.communityId),
    threadId: article.forumThread?.id ?? null,
    replyCount: article.forumThread ? Math.max(0, article.forumThread._count.posts - 1) : 0,
  };
}

export const CURATED_QUEUE_PAGE_SIZE = 50;

export async function listCuratedArticles(status: ExternalArticleStatus): Promise<{ items: ExternalArticleDto[]; total: number }> {
  const [items, total] = await Promise.all([
    db.externalArticle.findMany({
      where: { status },
      include: ARTICLE_DTO_INCLUDE,
      orderBy:
        status === ExternalArticleStatus.approved
          ? [{ approvedAt: "desc" }]
          : status === ExternalArticleStatus.scheduled
            ? [{ scheduledAt: "asc" }, { id: "asc" }]
            : status === ExternalArticleStatus.rejected
            ? [{ reviewedAt: "desc" }]
            : [{ fetchedAt: "desc" }, { publishedAt: "desc" }],
      take: CURATED_QUEUE_PAGE_SIZE,
    }),
    db.externalArticle.count({ where: { status } }),
  ]);
  return { items: items.map(toArticleDto), total };
}

export async function getCuratedArticleCounts(): Promise<Record<ExternalArticleStatus, number>> {
  const rows = await db.externalArticle.groupBy({ by: ["status"], _count: { _all: true } });
  const counts = { pending: 0, scheduled: 0, approved: 0, rejected: 0 } as Record<ExternalArticleStatus, number>;
  for (const row of rows) counts[row.status] = row._count._all;
  return counts;
}

export async function getPendingCuratedArticleCount(): Promise<number> {
  return db.externalArticle.count({ where: { status: ExternalArticleStatus.pending } });
}

export async function updateCuratedArticle(id: string, adminId: string, input: CuratedArticleUpdateInput): Promise<ExternalArticleDto> {
  const existing = await db.externalArticle.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new CuratedArticleError(404, "Article not found.");
  await assertCommunitiesExist(input.communityIds);
  const updated = await db.$transaction(async (tx) => {
    await tx.externalArticleCommunity.deleteMany({ where: { articleId: id } });
    const article = await tx.externalArticle.update({
      where: { id },
      data: {
        title: input.title,
        excerpt: input.excerpt,
        communities: { create: input.communityIds.map((communityId) => ({ communityId })) },
      },
      include: ARTICLE_DTO_INCLUDE,
    });
    // Keep a started discussion's title in step, same as library-server.ts does on rename.
    await tx.forumThread.updateMany({ where: { externalArticleId: id }, data: { title: input.title } });
    await recordAdminAction(
      { actorId: adminId, action: "curated_articles.article_edited", entityType: "ExternalArticle", entityId: id, metadata: { title: input.title } },
      tx,
    );
    return article;
  });
  return toArticleDto(updated);
}

/**
 * Moves an article between review states. What "approve" means depends on
 * the article's history:
 * - never published: it joins the release queue (`scheduled`) and the worker
 *   publishes it on the per-community cadence (curated-articles-release.ts);
 * - `postNow`: it's published immediately, at the top of the feed;
 * - previously published (approvedAt set, then unpublished): it's published
 *   again immediately, back at its original feed position.
 * Only `approved` articles reach the feed. A started discussion thread is
 * hidden (ForumThread.removed) whenever its article isn't approved and shown
 * again on re-approval, so unpublishing never destroys members' replies.
 */
export async function setCuratedArticleStatus(
  id: string,
  adminId: string,
  requested: "pending" | "approved" | "rejected",
  options: { postNow?: boolean; now?: Date } = {},
): Promise<ExternalArticleDto> {
  const now = options.now ?? new Date();
  const existing = await db.externalArticle.findUnique({ where: { id }, select: { status: true, approvedAt: true, title: true } });
  if (!existing) throw new CuratedArticleError(404, "Article not found.");

  const publishNow = requested === "approved" && (options.postNow || existing.approvedAt !== null);
  const status: ExternalArticleStatus =
    requested === "approved" ? (publishNow ? ExternalArticleStatus.approved : ExternalArticleStatus.scheduled) : requested;
  // Already queued and asked to queue again: nothing to change.
  if (status === existing.status && status === ExternalArticleStatus.scheduled) {
    const unchanged = await db.externalArticle.findUniqueOrThrow({ where: { id }, include: ARTICLE_DTO_INCLUDE });
    return toArticleDto(unchanged);
  }

  const updated = await db.$transaction(async (tx) => {
    const article = await tx.externalArticle.update({
      where: { id },
      data: {
        status,
        reviewedAt: status === ExternalArticleStatus.pending ? null : now,
        reviewedById: status === ExternalArticleStatus.pending ? null : adminId,
        scheduledAt: status === ExternalArticleStatus.scheduled ? now : null,
        // First publish fixes the feed position; republishing keeps it, so an
        // article never jumps back to the top of everyone's feed.
        ...(status === ExternalArticleStatus.approved && !existing.approvedAt ? { approvedAt: now, lastActivityAt: now } : {}),
      },
      include: ARTICLE_DTO_INCLUDE,
    });
    await tx.forumThread.updateMany({
      where: { externalArticleId: id },
      data: { removed: status !== ExternalArticleStatus.approved },
    });
    if (existing.status !== status) {
      await recordAdminAction(
        {
          actorId: adminId,
          action: `curated_articles.article_${status}`,
          entityType: "ExternalArticle",
          entityId: id,
          metadata: { title: existing.title, from: existing.status, ...(options.postNow ? { postNow: true } : {}) },
        },
        tx,
      );
    }
    return article;
  });
  return toArticleDto(updated);
}

/** An admin pasting one article link: read its link preview, cache the image, queue it as pending. */
export async function addCuratedArticleByUrl(
  adminId: string,
  input: { url: string; communityIds: string[] },
): Promise<ExternalArticleDto> {
  await assertCommunitiesExist(input.communityIds);
  const normalized = normalizeArticleUrl(input.url);
  if (!normalized) throw new CuratedArticleError(400, "Enter a full http(s) link.");
  const already = await db.externalArticle.findUnique({ where: { url: normalized }, select: { status: true } });
  if (already) throw new CuratedArticleError(409, `That article is already in the queue (${already.status}).`);

  let preview: Awaited<ReturnType<typeof previewArticleFromUrl>>;
  try {
    preview = await previewArticleFromUrl(normalized);
  } catch (error) {
    if (error instanceof ArticleFetchError) throw new CuratedArticleError(400, `Couldn't read that page: ${error.message}`);
    throw new CuratedArticleError(400, "Couldn't read that page.");
  }
  const canonicalDuplicate =
    preview.url !== normalized ? await db.externalArticle.findUnique({ where: { url: preview.url }, select: { status: true } }) : null;
  if (canonicalDuplicate) throw new CuratedArticleError(409, `That article is already in the queue (${canonicalDuplicate.status}).`);

  const imageKey = preview.imageUrl ? await cacheArticleImage(preview.imageUrl) : null;
  const created = await db.$transaction(async (tx) => {
    const article = await tx.externalArticle.create({
      data: {
        url: preview.url,
        title: preview.title,
        excerpt: preview.excerpt,
        sourceName: preview.sourceName,
        imageKey,
        originalImageUrl: imageKey ? preview.imageUrl : null,
        status: ExternalArticleStatus.pending,
        addedById: adminId,
        communities: { create: input.communityIds.map((communityId) => ({ communityId })) },
      },
      include: ARTICLE_DTO_INCLUDE,
    });
    await recordAdminAction(
      { actorId: adminId, action: "curated_articles.article_added", entityType: "ExternalArticle", entityId: article.id, metadata: { url: preview.url } },
      tx,
    );
    return article;
  });
  return toArticleDto(created);
}

// ---------------------------------------------------------------------------
// Discussion
// ---------------------------------------------------------------------------

/**
 * "Discuss" on an approved article's feed row — any signed-in member, lazily
 * creating the article's one thread in the From the Web forum (same shape as
 * startKnowledgeItemDiscussion). Idempotent: a second click, or a click
 * racing another member's, resolves to the same thread.
 */
export async function startCuratedArticleDiscussion(articleId: string, actingUserId: string): Promise<{ threadId: string }> {
  const article = await db.externalArticle.findUnique({
    where: { id: articleId },
    select: { id: true, title: true, url: true, sourceName: true, status: true, forumThread: { select: { id: true } } },
  });
  if (!article || article.status !== ExternalArticleStatus.approved) throw new CuratedArticleError(404, "Article not found.");
  if (article.forumThread) return { threadId: article.forumThread.id };

  const forum = await db.forum.findUnique({ where: { slug: FROM_THE_WEB_FORUM_SLUG }, select: { id: true, active: true } });
  if (!forum || !forum.active) throw new CuratedArticleError(400, "The From the Web forum isn't set up yet — contact an admin.");

  try {
    const thread = await db.$transaction(async (tx) => {
      const created = await tx.forumThread.create({
        data: { forumId: forum.id, authorId: actingUserId, title: article.title, externalArticleId: article.id },
        select: { id: true },
      });
      await tx.forumPost.create({
        data: {
          threadId: created.id,
          authorId: actingUserId,
          body: `Discussion thread for this article from ${article.sourceName}: ${article.url}\n\nRead it, then share your thoughts below.`,
        },
      });
      return created;
    });
    return { threadId: thread.id };
  } catch (error) {
    // Lost the race to another member's click — their thread is the one.
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "P2002") {
      const existing = await db.forumThread.findUnique({ where: { externalArticleId: article.id }, select: { id: true } });
      if (existing) return { threadId: existing.id };
    }
    throw error;
  }
}

