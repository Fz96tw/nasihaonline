// Pure builder for the admin community membership report — no db, no "@/"
// alias, so it is unit-testable under node:test. lib/community-report-server.ts
// does the Prisma reads and feeds the rows in.

export type ReportMember = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  title: string | null;
  country: string | null;
  followsAllCommunities: boolean;
};

export type ReportMembership = { memberId: string; communityId: string; joinedAt: Date };

export type ReportCommunity = { id: string; name: string; slug: string };

export type CommunityMemberRow = ReportMember & { joinedAt: Date };

export type CommunityReportRow = ReportCommunity & {
  /** Members who joined this community explicitly, newest join first. */
  members: CommunityMemberRow[];
  directCount: number;
  /** "Follow all communities" members not already direct members here. */
  viaAllCount: number;
  totalCount: number;
  /** Direct joins within the trailing window (default 30 days). */
  newCount: number;
};

export type CommunityReport = {
  /** Ranked by direct joins, then total audience, then name. */
  communities: CommunityReportRow[];
  allFollowers: ReportMember[];
  /** Members with no community rows who don't follow all either. */
  unaffiliated: ReportMember[];
  activeMemberCount: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

export function buildCommunityReport(
  input: {
    communities: ReportCommunity[];
    members: ReportMember[];
    memberships: ReportMembership[];
  },
  now: Date = new Date(),
  newWindowDays = 30,
): CommunityReport {
  const memberById = new Map(input.members.map((m) => [m.id, m]));
  const newSince = now.getTime() - newWindowDays * DAY_MS;
  const allFollowers = input.members.filter((m) => m.followsAllCommunities).sort(byName);

  const direct = new Map<string, CommunityMemberRow[]>();
  const affiliated = new Set<string>();
  for (const row of input.memberships) {
    // Memberships of suspended/non-member accounts aren't in `members`; skip them.
    const member = memberById.get(row.memberId);
    if (!member) continue;
    affiliated.add(member.id);
    const list = direct.get(row.communityId) ?? [];
    list.push({ ...member, joinedAt: row.joinedAt });
    direct.set(row.communityId, list);
  }

  const communities = input.communities
    .map((community) => {
      const members = (direct.get(community.id) ?? []).sort(
        (a, b) => b.joinedAt.getTime() - a.joinedAt.getTime(),
      );
      const directIds = new Set(members.map((m) => m.id));
      const viaAllCount = allFollowers.filter((m) => !directIds.has(m.id)).length;
      return {
        ...community,
        members,
        directCount: members.length,
        viaAllCount,
        totalCount: members.length + viaAllCount,
        newCount: members.filter((m) => m.joinedAt.getTime() >= newSince).length,
      };
    })
    .sort((a, b) => b.directCount - a.directCount || b.totalCount - a.totalCount || byName(a, b));

  const unaffiliated = input.members
    .filter((m) => !m.followsAllCommunities && !affiliated.has(m.id))
    .sort(byName);

  return { communities, allFollowers, unaffiliated, activeMemberCount: input.members.length };
}

export function communityMembersCsv(
  rows: Array<ReportMember & { joinedAt?: Date | null }>,
  profileUrl: (memberId: string) => string,
): string {
  const header = ["Name", "Email", "Title", "Country", "Joined community", "Profile"];
  const lines = rows.map((m) => [
    m.name,
    m.email,
    m.title ?? "",
    m.country ?? "",
    m.joinedAt ? m.joinedAt.toISOString().slice(0, 10) : "",
    profileUrl(m.id),
  ]);
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  return [header, ...lines].map((row) => row.map(escape).join(",")).join("\n");
}
