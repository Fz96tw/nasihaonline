// DB-backed test for changing a submitted Library item's visibility from the
// edit form (updateKnowledgeItem), in both directions. Same safety rules as the
// other .db.test.ts files: runs only against a scratch/test database, e.g.
//   REFLECTION_TEST_DATABASE_URL=postgresql://…/some_scratch_db npm run test:db
// Emails are not sent (RESEND_API_KEY unset).
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

const url = process.env.REFLECTION_TEST_DATABASE_URL;
const dbName = url ? new URL(url).pathname.slice(1) : "";
const skip = !url
  ? "set REFLECTION_TEST_DATABASE_URL to a scratch database to run"
  : !/scratch|test/i.test(dbName)
    ? `refusing to run against "${dbName}": database name must contain "scratch" or "test"`
    : false;

if (url && !skip) {
  process.env.DATABASE_URL = url;
  delete process.env.RESEND_API_KEY;
}

describe("Library item visibility edits (DB-backed)", { skip }, () => {
  let db: typeof import("@/lib/db").db;
  let library: typeof import("@/lib/library-server");
  type Actor = Parameters<typeof import("@/lib/library-server").updateKnowledgeItem>[1];

  let author: Actor;
  let admin: Actor;
  let outsider: Actor;
  let inviteeId: string;
  let hiddenMemberId: string;
  let categoryId: string;
  let communityId: string;
  const suffix = Date.now();

  before(async () => {
    ({ db } = await import("@/lib/db"));
    library = await import("@/lib/library-server");

    const member = (key: string, extra: Record<string, unknown> = {}) =>
      db.user.create({
        data: {
          clerkUserId: `test_vis_${key}_${suffix}`,
          email: `vis-${key}-${suffix}@example.test`,
          name: `Vis ${key}`,
          role: "member",
          tier: "active",
          profile: { create: { listInDirectory: true } },
          ...extra,
        },
      });
    author = (await member("author")) as Actor;
    admin = (await member("admin", { role: "admin" })) as Actor;
    outsider = (await member("outsider")) as Actor;
    inviteeId = (await member("invitee")).id;
    hiddenMemberId = (
      await db.user.create({
        data: {
          clerkUserId: `test_vis_hidden_${suffix}`,
          email: `vis-hidden-${suffix}@example.test`,
          name: "Vis hidden",
          role: "member",
          tier: "active",
          profile: { create: { listInDirectory: false } },
        },
      })
    ).id;

    const community = await db.community.create({ data: { name: `Vis community ${suffix}`, slug: `vis-community-${suffix}` } });
    communityId = community.id;
    categoryId = (
      await db.knowledgeCategory.create({
        data: { name: `Vis category ${suffix}`, slug: `vis-category-${suffix}`, communityId },
      })
    ).id;
  });

  async function createItem(visibility: "public" | "restricted", status: "published" | "pending_review" = "published") {
    return db.knowledgeItem.create({
      data: {
        title: `Vis item ${visibility} ${Math.random()}`,
        description: "About it",
        body: "<p>Body</p>",
        contentType: "blog_post",
        level: "all_levels",
        contributorId: author.id,
        visibility,
        status,
        licenseConsented: true,
        categories: { create: [{ categoryId }] },
        communities: { create: [{ communityId }] },
        invitees: visibility === "restricted" ? { create: [{ userId: inviteeId }] } : undefined,
      },
    });
  }

  function editInput(title: string, extra: { visibility?: "public" | "restricted"; invitedUserIds?: string[] }) {
    return {
      title,
      body: "<p>Body</p>",
      contentType: "blog_post" as const,
      level: "all_levels" as const,
      communityIds: [communityId],
      categoryIds: [categoryId],
      tagIds: [],
      youtubeUrl: null,
      externalUrl: null,
      deidentificationConfirmed: false,
      showTitleOverlay: false,
      file: null,
      heroImage: null,
      ...extra,
    };
  }

  async function state(id: string) {
    const row = await db.knowledgeItem.findUniqueOrThrow({
      where: { id },
      select: { visibility: true, status: true, invitees: { select: { userId: true } } },
    });
    return { ...row, invitees: row.invitees.map((i) => i.userId).sort() };
  }

  it("admin can make a restricted published item public; invitees are cleared, status unchanged", async () => {
    const item = await createItem("restricted");
    await library.updateKnowledgeItem(item.id, admin, editInput(item.title, { visibility: "public" }));
    const after = await state(item.id);
    assert.equal(after.visibility, "public");
    assert.equal(after.status, "published");
    assert.deepEqual(after.invitees, []);
    const outsiderView = await library.getPublishedKnowledgeItemById(item.id, outsider.id, false);
    assert.ok(outsiderView, "a non-invited member can now open it");
    assert.ok(await library.getPublishedKnowledgeItemById(item.id, null, false), "and so can a signed-out visitor");
  });

  it("owner can make a public published item restricted, inviting and notifying the picked members", async () => {
    const item = await createItem("public");
    await library.updateKnowledgeItem(
      item.id,
      author,
      editInput(item.title, { visibility: "restricted", invitedUserIds: [inviteeId, hiddenMemberId, author.id] }),
    );
    const after = await state(item.id);
    assert.equal(after.visibility, "restricted");
    // Not directory-listed members and the contributor themselves are dropped.
    assert.deepEqual(after.invitees, [inviteeId]);
    const notes = await db.notification.findMany({ where: { recipientId: inviteeId, link: `/library/${item.id}` } });
    assert.equal(notes.length, 1);
    assert.equal(await library.getPublishedKnowledgeItemById(item.id, outsider.id, false), null);
  });

  it("public → restricted with no eligible invitee is rejected and leaves the item public", async () => {
    const item = await createItem("public");
    await assert.rejects(
      library.updateKnowledgeItem(item.id, author, editInput(item.title, { visibility: "restricted", invitedUserIds: [hiddenMemberId] })),
      /at least one member/,
    );
    assert.equal((await state(item.id)).visibility, "public");
  });

  it("an unpublished item switched to restricted notifies no one yet", async () => {
    const item = await createItem("public", "pending_review");
    await library.updateKnowledgeItem(item.id, author, editInput(item.title, { visibility: "restricted", invitedUserIds: [inviteeId] }));
    assert.deepEqual((await state(item.id)).invitees, [inviteeId]);
    const notes = await db.notification.findMany({ where: { recipientId: inviteeId, link: `/library/${item.id}` } });
    assert.equal(notes.length, 0);
  });

  it("restricted item edited without changing visibility keeps its invitees (picker list ignored)", async () => {
    const item = await createItem("restricted");
    await library.updateKnowledgeItem(item.id, author, editInput("Renamed", { visibility: "restricted", invitedUserIds: [] }));
    const after = await state(item.id);
    assert.equal(after.visibility, "restricted");
    assert.deepEqual(after.invitees, [inviteeId]);
  });

  it("omitting visibility keeps the stored value", async () => {
    const item = await createItem("restricted");
    await library.updateKnowledgeItem(item.id, author, editInput("Renamed again", {}));
    assert.equal((await state(item.id)).visibility, "restricted");
  });

  it("a non-owner, non-staff member cannot change visibility", async () => {
    const item = await createItem("restricted");
    await assert.rejects(library.updateKnowledgeItem(item.id, outsider, editInput(item.title, { visibility: "public" })), /Only the submitter/);
    assert.equal((await state(item.id)).visibility, "restricted");
  });
});
