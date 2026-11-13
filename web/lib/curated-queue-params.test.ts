import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ADDED_BY_LINK, clampPage, parseQueueParams, queueHref, showingRange } from "./curated-queue-params.ts";

describe("[AC:dddb06dd:ac_4] review-queue URL parameters", () => {
  it("parses status, page, sort and source with safe defaults", () => {
    assert.deepEqual(parseQueueParams({}), { status: "pending", page: 1, sort: "newest", source: null });
    assert.deepEqual(parseQueueParams({ status: "scheduled" }), { status: "scheduled", page: 1, sort: "oldest", source: null }, "Scheduled defaults to release order");
    assert.deepEqual(parseQueueParams({ status: "bogus", page: "-3", sort: "sideways", source: " " }), {
      status: "pending",
      page: 1,
      sort: "newest",
      source: null,
    });
    assert.deepEqual(parseQueueParams({ status: "approved", page: "4", sort: "oldest", source: ADDED_BY_LINK }), {
      status: "approved",
      page: 4,
      sort: "oldest",
      source: ADDED_BY_LINK,
    });
  });

  it("clamps an out-of-range page to the last page", () => {
    assert.deepEqual(clampPage(9, 120), { page: 3, pageCount: 3 });
    assert.deepEqual(clampPage(1, 0), { page: 1, pageCount: 1 });
  });

  it("builds links that keep the other parameters, and go back to page 1 when sort or source changes", () => {
    const current = { status: "pending" as const, page: 3, sort: "oldest" as const, source: "src1" };
    assert.equal(queueHref(current, { page: 4 }), "/admin/curated-articles?status=pending&sort=oldest&source=src1&page=4");
    assert.equal(queueHref(current, { sort: "newest" }), "/admin/curated-articles?status=pending&source=src1");
    assert.equal(queueHref(current, { source: null }), "/admin/curated-articles?status=pending&sort=oldest");
    assert.equal(queueHref(current, { status: "rejected" }), "/admin/curated-articles?status=rejected&sort=oldest&source=src1");
    const defaults = { status: "pending" as const, page: 1, sort: "newest" as const, source: null };
    assert.equal(queueHref(defaults, { status: "scheduled" }), "/admin/curated-articles?status=scheduled", "a default sort follows the tab's own default");
  });
});

describe("[AC:dddb06dd:ac_1] showing range", () => {
  it("reports the 1-based range on the page", () => {
    assert.deepEqual(showingRange(1, 312), { from: 1, to: 50 });
    assert.deepEqual(showingRange(2, 312), { from: 51, to: 100 });
    assert.deepEqual(showingRange(7, 312), { from: 301, to: 312 });
    assert.deepEqual(showingRange(1, 0), { from: 0, to: 0 });
  });
});
