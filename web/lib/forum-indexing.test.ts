import assert from "node:assert/strict";
import { test } from "node:test";
import { isIndexableForumThread } from "./forum-indexing.ts";

const standalone = { eventId: null, knowledgeItemId: null };

test("[AC:441369e6:ac_1] auto-created event/library threads with no visible reply are not indexable", () => {
  assert.equal(isIndexableForumThread({ eventId: "e1", knowledgeItemId: null, visiblePostCount: 1 }), false);
  assert.equal(isIndexableForumThread({ eventId: null, knowledgeItemId: "k1", visiblePostCount: 1 }), false);
  // Every reply removed: back to just the placeholder.
  assert.equal(isIndexableForumThread({ eventId: "e1", knowledgeItemId: null, visiblePostCount: 0 }), false);
});

test("[AC:441369e6:ac_3] standalone threads, and auto-created threads with a reply, are indexable", () => {
  assert.equal(isIndexableForumThread({ ...standalone, visiblePostCount: 1 }), true);
  assert.equal(isIndexableForumThread({ eventId: "e1", knowledgeItemId: null, visiblePostCount: 2 }), true);
  assert.equal(isIndexableForumThread({ eventId: null, knowledgeItemId: "k1", visiblePostCount: 5 }), true);
});

test("[AC:dfdf223a:ac_9] a curated article's discussion waits for a reply before it's indexable, like library threads", () => {
  assert.equal(isIndexableForumThread({ ...standalone, externalArticleId: "a1", visiblePostCount: 1 }), false);
  assert.equal(isIndexableForumThread({ ...standalone, externalArticleId: "a1", visiblePostCount: 2 }), true);
});
