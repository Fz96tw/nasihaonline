import { db } from "@/lib/db";
import { StatCard } from "@/components/dashboard/stat-card";

// Live count of approved members, replacing the prototype's "members online"
// live-presence stat per PRD §10 — the stack has no Socket.IO/presence infra.
export async function MemberCountStat() {
  const memberCount = await db.user.count({ where: { role: "member" } });

  return (
    <StatCard
      label="Total members"
      value={memberCount.toLocaleString()}
      sublabel="Approved members"
    />
  );
}
