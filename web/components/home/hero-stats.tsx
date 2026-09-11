import { StatItem } from "@/components/home/stat-item";
import { db } from "@/lib/db";
import { LedgerStatus, LedgerTransactionType } from "@/lib/generated/prisma/enums";

// Isolated behind its own Suspense boundary (see hero-section.tsx) so these
// DB-backed numbers don't block the hero image/headline from streaming.
// The homepage is statically generated (objective 4), and Docker's `next
// build` step has no network path to the database (standard build-stage
// isolation — the app only reaches postgres at container runtime) — so
// these fall back to 0 rather than failing the whole build. Production
// always has a reachable DB at request time, so real visitors never see
// this fallback; the tradeoff (accepted deliberately) is that these
// numbers reflect build time, not live data, until the next deploy.
export async function HeroStats() {
  let memberCount = 0;
  let totalKnowledgeHours = 0;
  try {
    const [count, confirmedHoursEarned] = await Promise.all([
      db.user.count(),
      db.contributionLedger.aggregate({
        where: {
          status: LedgerStatus.confirmed,
          OR: [
            { type: LedgerTransactionType.earned },
            { type: LedgerTransactionType.adjusted, hours: { gt: 0 } },
          ],
        },
        _sum: { hours: true },
      }),
    ]);
    memberCount = count;
    totalKnowledgeHours = Math.round(confirmedHoursEarned._sum.hours?.toNumber() ?? 0);
  } catch {
    // build-time DB-unreachable fallback — see comment above.
  }

  return (
    <>
      <StatItem val={memberCount} lbl="Members" />
      <StatItem val={totalKnowledgeHours} lbl="Knowledge Hours Shared" />
    </>
  );
}
