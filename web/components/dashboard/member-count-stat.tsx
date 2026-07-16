import { db } from "@/lib/db";
import { StatCard } from "@/components/dashboard/stat-card";
import { Role } from "@/lib/generated/prisma/enums";

// Live count of approved members, replacing the prototype's "members online"
// live-presence stat per PRD §10 — the stack has no Socket.IO/presence infra.
// Moderators/admins are still members, just with extra permissions on top —
// same [member, moderator, admin] set lib/reports-server.ts uses for tier counts.
export async function MemberCountStat() {
  const memberCount = await db.user.count({
    where: { role: { in: [Role.member, Role.moderator, Role.admin] } },
  });

  return (
    <StatCard
      label="Total members"
      value={memberCount.toLocaleString()}
      sublabel="Approved members"
    />
  );
}
