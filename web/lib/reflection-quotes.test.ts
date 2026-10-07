import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickNextQuote, type QuoteCandidate } from "./reflection-quotes.ts";

const day = (n: number) => new Date(Date.UTC(2026, 0, n));

function quote(id: string, overrides: Partial<QuoteCandidate> = {}): QuoteCandidate {
  return { id, active: true, lastPostedAt: null, createdAt: day(1), ...overrides };
}

function pickedId(quotes: QuoteCandidate[]): string {
  const result = pickNextQuote(quotes);
  assert.equal(result.status, "ok");
  return result.status === "ok" ? result.quote.id : "";
}

describe("pickNextQuote", () => {
  it("prefers a never-posted quote over any posted one", () => {
    assert.equal(pickedId([quote("a", { lastPostedAt: day(5) }), quote("b")]), "b");
  });

  it("picks the least recently posted when all have been posted", () => {
    const quotes = [
      quote("a", { lastPostedAt: day(9) }),
      quote("b", { lastPostedAt: day(3) }),
      quote("c", { lastPostedAt: day(6) }),
    ];
    assert.equal(pickedId(quotes), "b");
  });

  it("never returns an inactive quote, even if it is the least recently posted", () => {
    const quotes = [quote("old", { active: false }), quote("a", { lastPostedAt: day(2) }), quote("b", { lastPostedAt: day(8) })];
    assert.equal(pickedId(quotes), "a");
  });

  it("returns empty, not an exception, for an empty pool", () => {
    assert.deepEqual(pickNextQuote([]), { status: "empty" });
  });

  it("returns empty when every quote is inactive", () => {
    assert.deepEqual(pickNextQuote([quote("a", { active: false }), quote("b", { active: false })]), { status: "empty" });
  });

  it("breaks ties on createdAt, then id, deterministically regardless of input order", () => {
    const earlier = quote("z", { createdAt: day(1) });
    const later = quote("a", { createdAt: day(2) });
    assert.equal(pickedId([later, earlier]), "z");
    assert.equal(pickedId([earlier, later]), "z");

    const sameTime = [quote("b"), quote("a"), quote("c")];
    assert.equal(pickedId(sameTime), "a");
    assert.equal(pickedId([...sameTime].reverse()), "a");
  });

  it("walks the whole pool once, then starts a new cycle", () => {
    const pool = [quote("a", { createdAt: day(1) }), quote("b", { createdAt: day(2) }), quote("c", { createdAt: day(3) })];
    const order: string[] = [];
    for (let week = 0; week < 6; week++) {
      const id = pickedId(pool);
      order.push(id);
      const picked = pool.find((q) => q.id === id)!;
      picked.lastPostedAt = day(10 + week);
    }
    assert.deepEqual(order, ["a", "b", "c", "a", "b", "c"]);
  });

  it("picks up a quote added mid-cycle next, rather than waiting for the cycle to finish", () => {
    const pool = [quote("a", { lastPostedAt: day(10) }), quote("b", { lastPostedAt: day(11) })];
    pool.push(quote("fresh", { createdAt: day(12) }));
    assert.equal(pickedId(pool), "fresh");
  });

  it("picks up a reactivated quote by its original posting date", () => {
    const pool = [quote("a", { lastPostedAt: day(10) }), quote("b", { lastPostedAt: day(2), active: false })];
    assert.equal(pickedId(pool), "a");
    pool[1].active = true;
    assert.equal(pickedId(pool), "b");
  });
});
