// DB-backed test for public (signed-out) access to Library item and forum
// thread detail pages (SEO objective 789ae42a). Same safety rules as the other
// .db.test.ts files: runs only against a scratch/test database, e.g.
//   REFLECTION_TEST_DATABASE_URL=postgresql://…/some_scratch_db npm run test:db
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

const url = process.env.REFLECTION_TEST_DATABASE_URL;
const dbName = url ? new URL(url).pathname.slice(1) : "";
const skip = !url
  ? "set REFLECTION_TEST_DATABASE_URL to a scratch database to run"
  : !/scratch|test/i.test(dbName)
    ? `refusing to run against "${dbName}": database name must contain "scratch" or "test"`
    : false;

if (url && !skip) process.env.DATABASE_URL = url;

describe("Public library items and forum threads (DB-backed)", { skip }, () => {
  let db: typeof import("@/lib/db").db;
  let library: typeof import("@/lib/library-server");
  let forums: typeof import("@/lib/forums-server");
  let canViewPastedImage: typeof import("@/lib/pasted-images-server").canViewPastedImage;

  let authorId: string;
  const items: Record<string, string> = {};
  const threads: Record<string, { id: string; slug: string }> = {};
  let publicPostId: string;
  let gatedPostId: string;
  let outsiderId: string;
  let insiderId: string;
  let clinicalPostId: string;

  before(async () => {
    ({ db } = await import("@/lib/db"));
    library = await import("@/lib/library-server");
    forums = await import("@/lib/forums-server");
    ({ canViewPastedImage } = await import("@/lib/pasted-images-server"));

    const author = await db.user.create({
      data: { clerkUserId: `test_public_author_${Date.now()}`, email: `public-author-${Date.now()}@example.test`, name: "Pat Author", role: "member", tier: "active" },
    });
    authorId = author.id;

    const item = async (key: string, data: { status: "published" | "flagged" | "pending_review"; visibility: "public" | "restricted" }) => {
      const created = await db.knowledgeItem.create({
        data: { title: `Item ${key}`, description: `About ${key}`, contentType: "article", contributorId: authorId, ...data },
      });
      items[key] = created.id;
    };
    await item("public", { status: "published", visibility: "public" });
    await item("restricted", { status: "published", visibility: "restricted" });
    await item("flagged", { status: "flagged", visibility: "public" });
    await item("pending", { status: "pending_review", visibility: "public" });

    const suffix = Date.now();
    const forum = (slug: string, extra: Record<string, unknown> = {}) =>
      db.forum.upsert({ where: { slug }, update: { active: true }, create: { slug, name: `Test ${slug} ${suffix}`, ...extra } });
    const general = await forum(`test-general-${suffix}`);
    const clinical = await forum("clinical-discussions");
    const libraryForum = await forum("library-discussions");
    const community = await db.community.create({ data: { name: `Test community ${suffix}`, slug: `test-community-${suffix}` } });
    const category = await db.knowledgeCategory.create({
      data: { name: `Test category ${suffix}`, slug: `test-category-${suffix}`, communityId: community.id },
    });
    const gated = await forum(`test-gated-${suffix}`, { categoryId: category.id });

    const thread = async (key: string, forumRow: { id: string; slug: string }, data: Record<string, unknown> = {}) => {
      const created = await db.forumThread.create({
        data: {
          forumId: forumRow.id,
          authorId,
          title: `Thread ${key}`,
          ...data,
          posts: { create: [{ authorId, body: `Opening post for ${key}` }] },
        },
        include: { posts: true },
      });
      threads[key] = { id: created.id, slug: forumRow.slug };
      return created;
    };
    publicPostId = (await thread("community", general)).posts[0].id;
    await thread("invited", general, { visibility: "invited" });
    await thread("removed", general, { removed: true });
    clinicalPostId = (await thread("clinical", clinical)).posts[0].id;
    gatedPostId = (await thread("gated", gated)).posts[0].id;
    // An invite-only thread in the gated forum: never public, even to members.
    await thread("gatedInvited", gated, { visibility: "invited" });

    const stamp = Date.now();
    outsiderId = (
      await db.user.create({
        data: {
          clerkUserId: `test_public_outsider_${stamp}`,
          email: `public-outsider-${stamp}@example.test`,
          name: "Olu Outsider",
          role: "member",
          tier: "active",
          profile: { create: { followsAllCommunities: false } },
        },
      })
    ).id;
    insiderId = (
      await db.user.create({
        data: {
          clerkUserId: `test_public_insider_${stamp}`,
          email: `public-insider-${stamp}@example.test`,
          name: "Ina Insider",
          role: "member",
          tier: "active",
          profile: { create: { followsAllCommunities: false, communities: { create: [{ communityId: community.id }] } } },
        },
      })
    ).id;
    await thread("publicItemDiscussion", libraryForum, { knowledgeItemId: items.public });
    await thread("restrictedItemDiscussion", libraryForum, { knowledgeItemId: items.restricted });
  });

  it("[AC:789ae42a:ac_1] a signed-out reader gets a published public library item", async () => {
    const detail = await library.getPublishedKnowledgeItemById(items.public, null, false);
    assert.equal(detail?.id, items.public);
  });

  it("[AC:789ae42a:ac_3] restricted, flagged and pending library items are hidden from signed-out readers", async () => {
    for (const key of ["restricted", "flagged", "pending"]) {
      assert.equal(await library.getPublishedKnowledgeItemById(items[key], null, false), null, key);
    }
    // Members still see a flagged public item, as before.
    assert.equal((await library.getPublishedKnowledgeItemById(items.flagged, authorId, false))?.id, items.flagged);
  });

  it("[AC:789ae42a:ac_2] [AC:bd5ab015:ac_1] a signed-out reader gets community and community-gated threads with their posts", async () => {
    const detail = await forums.getForumThreadDetail(threads.community.slug, threads.community.id, undefined, false);
    assert.equal(detail?.id, threads.community.id);
    const gated = await forums.getForumThreadDetail(threads.gated.slug, threads.gated.id, undefined, false);
    assert.equal(gated?.id, threads.gated.id);
    assert.equal(detail?.posts.length, 1);
    const libraryThread = await forums.getForumThreadDetail("library-discussions", threads.publicItemDiscussion.id, undefined, false);
    assert.equal(libraryThread?.id, threads.publicItemDiscussion.id);
  });

  it("[AC:789ae42a:ac_3] [AC:bd5ab015:ac_2] invited, removed, clinical and restricted-item threads are hidden from signed-out readers", async () => {
    for (const key of ["invited", "removed", "clinical", "restrictedItemDiscussion"]) {
      const { id, slug } = threads[key];
      assert.equal(await forums.getForumThreadDetail(slug, id, undefined, false), null, key);
    }
    // A member can still read the clinical thread.
    const clinical = await forums.getForumThreadDetail("clinical-discussions", threads.clinical.id, authorId, false);
    assert.equal(clinical?.id, threads.clinical.id);
  });

  it("[AC:789ae42a:ac_6] [AC:bd5ab015:ac_1] sitemap entries list exactly the publicly readable items and threads", async () => {
    const itemIds = new Set((await library.getPublicKnowledgeItemSitemapEntries()).map((entry) => entry.id));
    assert.ok(itemIds.has(items.public));
    for (const key of ["restricted", "flagged", "pending"]) assert.ok(!itemIds.has(items[key]), key);

    const threadIds = new Set((await forums.getPublicForumThreadSitemapEntries()).map((entry) => entry.id));
    assert.ok(threadIds.has(threads.community.id));
    assert.ok(threadIds.has(threads.publicItemDiscussion.id));
    assert.ok(threadIds.has(threads.gated.id));
    for (const key of ["invited", "removed", "clinical", "restrictedItemDiscussion"]) {
      assert.ok(!threadIds.has(threads[key].id), key);
    }
  });

  it("[AC:789ae42a:ac_1] pasted images follow their content's public readability", async () => {
    const image = (data: Partial<{ forumPostId: string; knowledgeItemId: string }>, ownerType: "forum_post" | "library_item") => ({
      uploaderId: authorId,
      ownerType,
      forumPostId: data.forumPostId ?? null,
      inboxMessageId: null,
      knowledgeItemId: data.knowledgeItemId ?? null,
    });
    assert.equal(await canViewPastedImage(image({ forumPostId: publicPostId }, "forum_post"), null), true);
    assert.equal(await canViewPastedImage(image({ forumPostId: clinicalPostId }, "forum_post"), null), false);
    assert.equal(await canViewPastedImage(image({ knowledgeItemId: items.public }, "library_item"), null), true);
    assert.equal(await canViewPastedImage(image({ knowledgeItemId: items.restricted }, "library_item"), null), false);
    assert.equal(await canViewPastedImage(image({}, "forum_post"), null), false, "unlinked draft image");
  });

  it("[AC:412202d3:ac_1] [AC:412202d3:ac_4] a member outside a community reads its public threads read-only; insiders still participate", async () => {
    const outsider = await forums.getForumThreadDetail(threads.gated.slug, threads.gated.id, outsiderId, false);
    assert.equal(outsider?.id, threads.gated.id);
    assert.equal(outsider?.canParticipate, false);
    assert.ok(outsider?.communityName?.startsWith("Test community"));

    const insider = await forums.getForumThreadDetail(threads.gated.slug, threads.gated.id, insiderId, false);
    assert.equal(insider?.canParticipate, true);

    // Non-public threads stay hidden from the outsider.
    assert.equal(await forums.getForumThreadDetail(threads.gatedInvited.slug, threads.gatedInvited.id, outsiderId, false), null);

    // Replying is still refused server-side.
    await assert.rejects(
      forums.createForumPost(threads.gated.id, outsiderId, { body: "hello", parentId: null, deidentificationConfirmed: false }),
      (error: { status?: number }) => error.status === 404,
    );
  });

  it("[AC:412202d3:ac_3] pasted images in a public community thread load for an outsider member", async () => {
    const outsider = await db.user.findUniqueOrThrow({ where: { id: outsiderId } });
    const image = { uploaderId: authorId, ownerType: "forum_post" as const, forumPostId: gatedPostId, inboxMessageId: null, knowledgeItemId: null };
    assert.equal(await canViewPastedImage(image, outsider), true);
  });
});
