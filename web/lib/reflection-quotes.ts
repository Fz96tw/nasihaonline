// Pure selection logic for the Weekly Reflection quote pool — deliberately no
// imports (no db, no "@/" alias) so it runs under the repo's plain
// `node --test --experimental-strip-types` runner. The DB-touching wrappers
// live in lib/reflection-quotes-server.ts.

export type QuoteCandidate = {
  id: string;
  active: boolean;
  lastPostedAt: Date | null;
  createdAt: Date;
};

export type PickResult<T extends QuoteCandidate> = { status: "ok"; quote: T } | { status: "empty" };

/**
 * Least-recently-posted active quote. A never-posted quote sorts before any
 * posted one; ties break on createdAt then id so the result is deterministic.
 * No separate cycle state: once every active quote has been posted the oldest
 * lastPostedAt is simply next again, which is the "reset the cycle" behavior —
 * and a quote added or reactivated mid-cycle is picked up next, not skipped.
 * Returns {status:"empty"} (never throws) when nothing is active, so the
 * posting job can skip the week cleanly.
 */
export function pickNextQuote<T extends QuoteCandidate>(quotes: readonly T[]): PickResult<T> {
  let best: T | null = null;
  for (const quote of quotes) {
    if (!quote.active) continue;
    if (best === null || compareByRotation(quote, best) < 0) best = quote;
  }
  return best === null ? { status: "empty" } : { status: "ok", quote: best };
}

function compareByRotation(a: QuoteCandidate, b: QuoteCandidate): number {
  if (a.lastPostedAt === null && b.lastPostedAt !== null) return -1;
  if (a.lastPostedAt !== null && b.lastPostedAt === null) return 1;
  if (a.lastPostedAt !== null && b.lastPostedAt !== null) {
    const byPosted = a.lastPostedAt.getTime() - b.lastPostedAt.getTime();
    if (byPosted !== 0) return byPosted;
  }
  const byCreated = a.createdAt.getTime() - b.createdAt.getTime();
  if (byCreated !== 0) return byCreated;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
