import "dotenv/config";
import { db } from "@/lib/db";
import { excerptFromHtml } from "@/lib/blog";
import { LIBRARY_FORUM_SLUG } from "@/lib/forums";
import { syncKnowledgeItemToIndex } from "@/lib/search-index-sync";
import { ContributionSource, KnowledgeStatus, LedgerTransactionType } from "@/lib/generated/prisma/enums";
import type { Prisma } from "@/lib/generated/prisma/client";

/**
 * One-time migration of the (retiring) Blog domain into the Knowledge
 * Library's `blog_post` content type — see
 * /home/nadeem/.claude/plans/ancient-exploring-music.md §3/§6 for the full
 * design. Converts every Post into a KnowledgeItem, every PostComment into a
 * ForumPost inside a per-item ForumThread (Library Discussions forum), and
 * repoints each post's blog_post-sourced ContributionEvent onto
 * library_submission/curate_resource. Does NOT touch the Post/PostComment/
 * etc. tables themselves — those are dropped in a separate, later cleanup
 * migration once app code has fully cut over and a verification soak has
 * passed. Safe to run against a live app: /blog and /blog/new stay
 * functional throughout (this only reads Post rows and writes new
 * KnowledgeItem/ForumThread/ForumPost/LegacyBlogSlug rows), so re-running
 * this script after new posts/comments have been created is expected and
 * safe — idempotency is keyed on LegacyBlogSlug, not a one-shot flag.
 *
 * Does NOT deactivate the `write_post` ContributionRule — /blog/new is
 * still live until the route-cutover phase, and still needs it active to
 * keep auto-crediting Knowledge Hours for genuinely new posts in the
 * meantime. That deactivation belongs to the cutover phase, once /blog/new
 * no longer exists to earn against it.
 *
 *   npx tsx scripts/migrate-blog-to-library.ts               # dry run (default) — reads only, writes nothing
 *   npx tsx scripts/migrate-blog-to-library.ts --commit       # performs the migration
 *   npx tsx scripts/migrate-blog-to-library.ts --verify       # row-count parity check after a commit run
 *
 * Take a `pg_dump` backup immediately before the first `--commit` run —
 * this repointing ContributionEvent rows is the one non-purely-additive
 * step (see repointContributionEvent below).
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";
const CURATE_RESOURCE_ACTIVITY_KEY = "curate_resource";

// Same slugification as prisma/seed.ts's category/tag seeding — kept in
// step so a find-or-create here never mints a KnowledgeCategory/KnowledgeTag
// whose slug would collide with what seed.ts would generate for the same name.
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/\//g, "-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type PostToMigrate = Prisma.PostGetPayload<{
  include: {
    categories: { include: { category: true } };
    tags: { include: { tag: true } };
    comments: true;
    views: true;
    contributionEvent: true;
  };
}>;

/**
 * Resolves every distinct PostCategory/PostTag name used by the posts about
 * to be migrated to a KnowledgeCategory/KnowledgeTag id, creating one where
 * no same-named row exists yet. Categories are expected to already align
 * 1:1 (both seeded from the same INTEREST_AREA_LABELS list) — this only
 * actually creates rows for any admin-added custom PostCategory/PostTag
 * that has no Library twin (e.g. Blog-only tags like "career-advice").
 * Resolved once up front rather than per-post so two posts sharing a
 * category don't race to create it twice.
 */
async function resolveCategoryAndTagIds(
  posts: PostToMigrate[],
): Promise<{
  categoryIdByName: Map<string, string>;
  tagIdByName: Map<string, string>;
  categoriesCreated: number;
  tagsCreated: number;
}> {
  const categoryNames = new Set<string>();
  const tagNames = new Set<string>();
  for (const post of posts) {
    for (const { category } of post.categories) categoryNames.add(category.name);
    for (const { tag } of post.tags) tagNames.add(tag.name);
  }

  const existingCategories = await db.knowledgeCategory.findMany({
    where: { name: { in: Array.from(categoryNames) } },
  });
  const categoryIdByName = new Map(existingCategories.map((c) => [c.name, c.id]));
  let categoriesCreated = 0;
  for (const name of Array.from(categoryNames)) {
    if (categoryIdByName.has(name)) continue;
    const created = await db.knowledgeCategory.create({ data: { name, slug: slugify(name) } });
    categoryIdByName.set(name, created.id);
    categoriesCreated += 1;
  }

  const existingTags = await db.knowledgeTag.findMany({ where: { name: { in: Array.from(tagNames) } } });
  const tagIdByName = new Map(existingTags.map((t) => [t.name, t.id]));
  let tagsCreated = 0;
  for (const name of Array.from(tagNames)) {
    if (tagIdByName.has(name)) continue;
    const created = await db.knowledgeTag.create({ data: { name, slug: slugify(name) } });
    tagIdByName.set(name, created.id);
    tagsCreated += 1;
  }

  return { categoryIdByName, tagIdByName, categoriesCreated, tagsCreated };
}

type MigrationStats = {
  postsMigrated: number;
  postsSkippedAlreadyMigrated: number;
  commentsMigrated: number;
  namedViewsMigrated: number;
  anonymousViewsDropped: number;
  contributionEventsRepointed: number;
  categoriesCreated: number;
  tagsCreated: number;
  failures: { postId: string; error: string }[];
};

async function migratePost(
  post: PostToMigrate,
  categoryIdByName: Map<string, string>,
  tagIdByName: Map<string, string>,
  curateResourceRuleId: string | null,
  libraryForumId: string | null,
  commit: boolean,
  stats: MigrationStats,
): Promise<void> {
  const existing = await db.legacyBlogSlug.findUnique({ where: { slug: post.slug } });
  if (existing) {
    stats.postsSkippedAlreadyMigrated += 1;
    return;
  }

  // A flagged post is always published (flagPost requires publishedAt, and
  // moderator "remove" clears flagged+publishedAt together — see
  // resolvePostFlag) — so this is really just a 2-way split in practice,
  // written as 3 to make that invariant explicit rather than assumed.
  const status = post.flagged
    ? KnowledgeStatus.flagged
    : post.publishedAt
      ? KnowledgeStatus.published
      : KnowledgeStatus.pending_review;

  const description = excerptFromHtml(post.body, 180);
  const namedViews = post.views.filter((v) => v.viewerKey.startsWith("user:"));
  const anonymousViewCount = post.views.length - namedViews.length;

  console.log(
    `${commit ? "Migrating" : "[dry run] Would migrate"} post ${post.id} "${post.title}" -> status=${status}, ` +
      `${post.categories.length} categories, ${post.tags.length} tags, ${post.comments.length} comments, ` +
      `${namedViews.length} named views (+${anonymousViewCount} anonymous views dropped), ` +
      `contributionEvent=${post.contributionEvent ? "yes" : "no"}`,
  );

  if (!commit) return;

  try {
    const item = await db.$transaction(async (tx) => {
      const item = await tx.knowledgeItem.create({
        data: {
          title: post.title,
          description,
          body: post.body,
          contentType: "blog_post",
          status,
          level: "all_levels",
          visibility: "public",
          contributorId: post.authorId,
          heroImageUrl: post.heroImageUrl,
          licenseConsented: post.licenseConsented,
          flagReason: post.flagReason,
          createdAt: post.createdAt,
          updatedAt: post.updatedAt,
        },
        select: { id: true },
      });

      await tx.legacyBlogSlug.create({ data: { slug: post.slug, knowledgeItemId: item.id } });

      if (post.categories.length > 0) {
        await tx.knowledgeItemCategory.createMany({
          data: post.categories.map(({ category }) => ({
            knowledgeItemId: item.id,
            categoryId: categoryIdByName.get(category.name)!,
          })),
        });
      }
      if (post.tags.length > 0) {
        await tx.knowledgeItemTag.createMany({
          data: post.tags.map(({ tag }) => ({ knowledgeItemId: item.id, tagId: tagIdByName.get(tag.name)! })),
        });
      }

      if (post.comments.length > 0) {
        if (!libraryForumId) {
          throw new Error("Library Discussions forum isn't seeded — cannot migrate comments.");
        }
        const thread = await tx.forumThread.create({
          data: {
            forumId: libraryForumId,
            authorId: post.authorId,
            title: post.title,
            knowledgeItemId: item.id,
            createdAt: post.createdAt,
          },
          select: { id: true },
        });
        // Same auto-authored opening post startKnowledgeItemDiscussion
        // creates for a real "Start a Discussion" click — required so
        // LIBRARY_CARD_SELECT's commentCount (posts.length - 1) stays
        // correct for a migrated thread too.
        await tx.forumPost.create({
          data: {
            threadId: thread.id,
            authorId: post.authorId,
            body: `Discussion thread for this resource. [View resource details](${APP_URL}/library/${item.id})`,
            createdAt: post.createdAt,
          },
        });

        // Oldest-first so a reply's parentPostId always points at an
        // already-created row — no notifications fire for this backfill
        // (skip createForumPost's side effects entirely; this is historical
        // data being reshaped, not new live activity, and firing @mention/
        // reply notifications for years-old comments would spam every
        // migrated commenter).
        const sortedComments = [...post.comments].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        const newPostIdByOldCommentId = new Map<string, string>();
        let lastActivityAt = post.createdAt;
        for (const comment of sortedComments) {
          const created = await tx.forumPost.create({
            data: {
              threadId: thread.id,
              authorId: comment.authorId,
              body: comment.body,
              parentPostId: comment.parentId ? newPostIdByOldCommentId.get(comment.parentId) : null,
              flagged: comment.flagged,
              flagReason: comment.flagReason,
              removed: comment.removed,
              createdAt: comment.createdAt,
            },
            select: { id: true },
          });
          newPostIdByOldCommentId.set(comment.id, created.id);
          if (comment.createdAt > lastActivityAt) lastActivityAt = comment.createdAt;
        }
        await tx.forumThread.update({ where: { id: thread.id }, data: { lastActivityAt } });
        stats.commentsMigrated += sortedComments.length;
      }

      if (namedViews.length > 0) {
        await tx.knowledgeItemView.createMany({
          data: namedViews.map((v) => ({
            knowledgeItemId: item.id,
            userId: v.viewerKey.slice("user:".length),
            createdAt: v.createdAt,
          })),
          skipDuplicates: true,
        });
      }

      if (post.contributionEvent && curateResourceRuleId) {
        await tx.contributionEvent.update({
          where: { id: post.contributionEvent.id },
          data: {
            ruleId: curateResourceRuleId,
            source: ContributionSource.library_submission,
            knowledgeItemId: item.id,
            postId: null,
          },
        });
        stats.contributionEventsRepointed += 1;
      }

      return item;
    });

    await syncKnowledgeItemToIndex(item.id);

    stats.postsMigrated += 1;
    stats.namedViewsMigrated += namedViews.length;
    stats.anonymousViewsDropped += anonymousViewCount;
  } catch (error) {
    stats.failures.push({ postId: post.id, error: error instanceof Error ? error.message : String(error) });
    console.error(`Failed to migrate post ${post.id}:`, error);
  }
}

async function runMigration(commit: boolean): Promise<void> {
  const posts = await db.post.findMany({
    include: {
      categories: { include: { category: true } },
      tags: { include: { tag: true } },
      comments: true,
      views: true,
      contributionEvent: true,
    },
    orderBy: { createdAt: "asc" },
  });
  console.log(`Found ${posts.length} post(s) in total.\n`);

  const {
    categoryIdByName,
    tagIdByName,
    categoriesCreated,
    tagsCreated,
  } = commit
    ? await resolveCategoryAndTagIds(posts)
    : { categoryIdByName: new Map<string, string>(), tagIdByName: new Map<string, string>(), categoriesCreated: 0, tagsCreated: 0 };

  const curateResourceRule = await db.contributionRule.findUnique({
    where: { activityKey: CURATE_RESOURCE_ACTIVITY_KEY },
  });
  if (commit && (!curateResourceRule || !curateResourceRule.active || curateResourceRule.type !== LedgerTransactionType.earned)) {
    console.warn(
      `WARNING: the "${CURATE_RESOURCE_ACTIVITY_KEY}" ContributionRule is missing/inactive — ` +
        `blog_post-sourced ContributionEvent rows will be left pointing at the old Post, not repointed.`,
    );
  }

  const libraryForum = await db.forum.findUnique({ where: { slug: LIBRARY_FORUM_SLUG } });
  if (!libraryForum) {
    console.warn(`WARNING: the "${LIBRARY_FORUM_SLUG}" forum isn't seeded — posts with comments will fail to migrate.`);
  }

  const stats: MigrationStats = {
    postsMigrated: 0,
    postsSkippedAlreadyMigrated: 0,
    commentsMigrated: 0,
    namedViewsMigrated: 0,
    anonymousViewsDropped: 0,
    contributionEventsRepointed: 0,
    categoriesCreated,
    tagsCreated,
    failures: [],
  };

  for (const post of posts) {
    await migratePost(
      post,
      categoryIdByName,
      tagIdByName,
      curateResourceRule?.id ?? null,
      libraryForum?.id ?? null,
      commit,
      stats,
    );
  }

  console.log(`\n${commit ? "Migration" : "Dry run"} summary:`);
  console.log(JSON.stringify(stats, null, 2));
  if (stats.failures.length > 0) {
    console.error(`\n${stats.failures.length} post(s) failed — see errors above. Re-run this script to retry them.`);
    process.exitCode = 1;
  }
}

/** Re-counts on both sides of the migration and reports any mismatch. */
async function runVerify(): Promise<void> {
  const postCount = await db.post.count();
  const migratedItemCount = await db.knowledgeItem.count({ where: { contentType: "blog_post" } });
  const commentCount = await db.postComment.count();
  // Scoped to blog_post-typed items specifically — the Library Discussions
  // forum also holds threads from non-blog KnowledgeItems' own "Start a
  // Discussion" button, which must not be counted here.
  const threadsWithComments = await db.forumThread.count({
    where: { knowledgeItem: { contentType: "blog_post" } },
  });
  const migratedForumPostCount = await db.forumPost.count({
    where: { thread: { knowledgeItem: { contentType: "blog_post" } } },
  });
  // Every migrated thread has exactly one auto-authored opening post beyond
  // the comments themselves.
  const expectedForumPostCount = commentCount + threadsWithComments;

  console.log(
    JSON.stringify(
      {
        postCount,
        migratedItemCount,
        postCountMatchesMigratedItemCount: postCount === migratedItemCount,
        commentCount,
        migratedForumPostCount,
        expectedForumPostCount,
        commentCountMatchesExpected: migratedForumPostCount === expectedForumPostCount,
      },
      null,
      2,
    ),
  );
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--verify")) {
    await runVerify();
  } else {
    await runMigration(args.includes("--commit"));
  }
}

main()
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
