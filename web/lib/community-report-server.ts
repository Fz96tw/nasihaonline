import "server-only";
import { db } from "@/lib/db";
import { Role } from "@/lib/generated/prisma/enums";
import { getProfileAvatarUrl } from "@/lib/storage";
import { SYSTEM_CLERK_USER_ID_PREFIX } from "@/lib/system-user-id";
import { buildCommunityReport, type CommunityReport, type ReportMember } from "@/lib/community-report";

/**
 * Admin community membership breakdown (/admin/reports/communities). Same
 * member population as reports-server.ts's KPIs (role member/moderator/admin),
 * minus suspended accounts and organizational system accounts, which aren't
 * people anyone would follow up with.
 */
export async function getCommunityMembershipReport(): Promise<CommunityReport> {
  const [communities, users, memberships] = await Promise.all([
    db.community.findMany({ select: { id: true, name: true, slug: true } }),
    db.user.findMany({
      where: {
        role: { in: [Role.member, Role.moderator, Role.admin] },
        suspended: false,
        NOT: { clerkUserId: { startsWith: SYSTEM_CLERK_USER_ID_PREFIX } },
      },
      select: {
        id: true,
        name: true,
        email: true,
        profile: {
          select: { avatarUrl: true, titleSpecialty: true, countryRegion: true, followsAllCommunities: true },
        },
      },
    }),
    db.profileCommunity.findMany({
      select: { communityId: true, createdAt: true, profile: { select: { userId: true } } },
    }),
  ]);

  const members: ReportMember[] = users.map((u) => ({
    id: u.id,
    name: u.name?.trim() || u.email,
    email: u.email,
    avatarUrl: getProfileAvatarUrl(u.profile?.avatarUrl ?? null),
    title: u.profile?.titleSpecialty ?? null,
    country: u.profile?.countryRegion ?? null,
    followsAllCommunities: u.profile?.followsAllCommunities ?? false,
  }));

  return buildCommunityReport({
    communities,
    members,
    memberships: memberships.map((m) => ({
      memberId: m.profile.userId,
      communityId: m.communityId,
      joinedAt: m.createdAt,
    })),
  });
}
