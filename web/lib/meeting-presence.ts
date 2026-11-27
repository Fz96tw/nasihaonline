/**
 * Whole minutes covered by a set of [start, end] millisecond intervals,
 * overlaps counted once — one member's connections to one meeting session,
 * where a rejoin or a second device must never double-count
 * (getPresenceMinutes in lib/meeting-presence-server.ts). Pure and
 * alias-free so `npm test` can run it directly.
 */
export function mergedIntervalMinutes(intervals: Array<[number, number]>): number {
  if (intervals.length === 0) return 0;
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  let totalMs = 0;
  let [curStart, curEnd] = sorted[0];
  for (const [start, end] of sorted.slice(1)) {
    if (start <= curEnd) {
      curEnd = Math.max(curEnd, end);
    } else {
      totalMs += curEnd - curStart;
      [curStart, curEnd] = [start, end];
    }
  }
  totalMs += curEnd - curStart;
  return Math.floor(totalMs / 60_000);
}
