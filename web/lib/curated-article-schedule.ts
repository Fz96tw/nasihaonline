// Release cadence for approved "From the Web" articles — pure functions, no
// "@/" imports, so node:test can exercise them directly
// (lib/curated-article-schedule.test.ts). The worker (lib/curated-articles-
// release.ts) feeds them database rows; the admin Scheduled tab uses the same
// simulation for its estimates, so the two never disagree.
//
// Rules: every community is a "slot", and articles tagged to no community
// share the GENERAL_SLOT. A slot publishes at most `perWeek` articles per
// rolling 7 days, at least 7/perWeek days apart. The queue is first-in,
// first-out by approval time; an article tagged to several communities goes
// out as soon as any one of its slots has room, and counts against all of
// them.

export const GENERAL_SLOT = "general";
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** How often the worker checks the queue — also the simulation's step. */
export const RELEASE_TICK_MS = 30 * 60 * 1000;
export const PER_WEEK_MIN = 1;
export const PER_WEEK_MAX = 14;

export type QueuedArticle = { id: string; scheduledAt: Date; communityIds: string[] };
export type ReleasedArticle = { approvedAt: Date; communityIds: string[] };

export function slotsOf(communityIds: string[]): string[] {
  return communityIds.length > 0 ? Array.from(new Set(communityIds)) : [GENERAL_SLOT];
}

export function clampPerWeek(perWeek: number): number {
  if (!Number.isFinite(perWeek)) return 3;
  return Math.min(PER_WEEK_MAX, Math.max(PER_WEEK_MIN, Math.round(perWeek)));
}

/** Minimum time between two releases in the same slot. */
export function minGapMs(perWeek: number): number {
  return WEEK_MS / clampPerWeek(perWeek);
}

type SlotState = { releases: number[] };

function buildState(recent: ReleasedArticle[], now: number): Map<string, SlotState> {
  const state = new Map<string, SlotState>();
  for (const article of recent) {
    const at = article.approvedAt.getTime();
    if (at > now || now - at >= WEEK_MS) continue;
    for (const slot of slotsOf(article.communityIds)) {
      const entry = state.get(slot) ?? { releases: [] };
      entry.releases.push(at);
      state.set(slot, entry);
    }
  }
  return state;
}

/** Earliest moment `slot` may release again, given its releases so far. */
function slotOpensAt(entry: SlotState | undefined, now: number, perWeek: number): number {
  if (!entry || entry.releases.length === 0) return now;
  const inWindow = entry.releases.filter((at) => now - at < WEEK_MS).sort((a, b) => a - b);
  const last = Math.max(...entry.releases);
  let opens = last + minGapMs(perWeek);
  // Window full: wait until enough of the oldest releases age out.
  const n = clampPerWeek(perWeek);
  if (inWindow.length >= n) opens = Math.max(opens, inWindow[inWindow.length - n] + WEEK_MS);
  return Math.max(now, opens);
}

function release(state: Map<string, SlotState>, slots: string[], at: number) {
  for (const slot of slots) {
    const entry = state.get(slot) ?? { releases: [] };
    entry.releases.push(at);
    state.set(slot, entry);
  }
}

function pass(queue: QueuedArticle[], state: Map<string, SlotState>, now: number, perWeek: number): string[] {
  const released: string[] = [];
  for (const article of queue) {
    const slots = slotsOf(article.communityIds);
    if (slots.some((slot) => slotOpensAt(state.get(slot), now, perWeek) <= now)) {
      release(state, slots, now);
      released.push(article.id);
    }
  }
  return released;
}

function byQueueOrder(queue: QueuedArticle[]): QueuedArticle[] {
  return [...queue].sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime() || a.id.localeCompare(b.id));
}

/**
 * Which queued articles to publish right now. Oldest-approved first; at most
 * one per slot per call, since a release closes its slots for minGapMs.
 * `recent` is every article published in the last 7 days (any status that
 * reached the feed, including "Post now").
 */
export function planReleases(input: {
  queue: QueuedArticle[];
  recent: ReleasedArticle[];
  perWeek: number;
  now: Date;
}): string[] {
  const now = input.now.getTime();
  return pass(byQueueOrder(input.queue), buildState(input.recent, now), now, input.perWeek);
}

/**
 * Estimated release time for every queued article, by replaying the worker's
 * ticks forward — an estimate: new approvals and "Post now" change it.
 * Articles that wouldn't go out within `horizonMs` map to null.
 */
export function estimateReleaseTimes(input: {
  queue: QueuedArticle[];
  recent: ReleasedArticle[];
  perWeek: number;
  now: Date;
  tickMs?: number;
  horizonMs?: number;
}): Map<string, Date | null> {
  const tick = input.tickMs ?? RELEASE_TICK_MS;
  const start = input.now.getTime();
  const horizon = start + (input.horizonMs ?? 26 * WEEK_MS);
  const state = buildState(input.recent, start);
  let remaining = byQueueOrder(input.queue);
  const result = new Map<string, Date | null>(remaining.map((article) => [article.id, null]));
  for (let t = start; remaining.length > 0 && t <= horizon; t += tick) {
    const released = new Set(pass(remaining, state, t, input.perWeek));
    if (released.size === 0) continue;
    for (const id of Array.from(released)) result.set(id, new Date(t));
    remaining = remaining.filter((article) => !released.has(article.id));
  }
  return result;
}

export type SlotSummary = {
  slot: string;
  queued: number;
  releasedThisWeek: number;
  /** When this slot may next publish (now if open); null when nothing is queued for it. */
  nextReleaseAt: Date | null;
};

/** Per-slot counts for the admin Scheduled tab. */
export function summarizeSlots(input: {
  queue: QueuedArticle[];
  recent: ReleasedArticle[];
  perWeek: number;
  now: Date;
}): SlotSummary[] {
  const now = input.now.getTime();
  const state = buildState(input.recent, now);
  const queued = new Map<string, number>();
  for (const article of input.queue) {
    for (const slot of slotsOf(article.communityIds)) queued.set(slot, (queued.get(slot) ?? 0) + 1);
  }
  const slots = new Set([...Array.from(queued.keys()), ...Array.from(state.keys())]);
  return Array.from(slots).map((slot) => {
    const entry = state.get(slot);
    const count = queued.get(slot) ?? 0;
    return {
      slot,
      queued: count,
      releasedThisWeek: entry ? entry.releases.length : 0,
      nextReleaseAt: count > 0 ? new Date(slotOpensAt(entry, now, input.perWeek)) : null,
    };
  });
}
