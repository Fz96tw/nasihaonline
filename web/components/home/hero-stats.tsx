import { StatItem } from "@/components/home/stat-item";
import { db } from "@/lib/db";
import { LedgerStatus, LedgerTransactionType } from "@/lib/generated/prisma/enums";

// Isolated behind its own Suspense boundary (see hero-section.tsx) so these
// DB-backed numbers don't block the hero image/headline from streaming.
export async function HeroStats() {
  const [memberCount, confirmedHoursEarned] = await Promise.all([
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
  const totalKnowledgeHours = Math.round(confirmedHoursEarned._sum.hours?.toNumber() ?? 0);

  return (
    <>
      <StatItem val={memberCount} lbl="Members" />
      <StatItem val={totalKnowledgeHours} lbl="Knowledge Hours Shared" />
    </>
  );
}
