import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCommunityReport, communityMembersCsv, type ReportMember } from "./community-report.ts";

const NOW = new Date("2026-10-21T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

function member(id: string, overrides: Partial<ReportMember> = {}): ReportMember {
  return {
    id,
    name: `Member ${id}`,
    email: `${id}@example.org`,
    avatarUrl: null,
    title: null,
    country: null,
    followsAllCommunities: false,
    ...overrides,
  };
}

const communities = [
  { id: "c-health", name: "Health", slug: "health" },
  { id: "c-tech", name: "Tech", slug: "tech" },
  { id: "c-arts", name: "Arts", slug: "arts" },
];

describe("buildCommunityReport", () => {
  const report = buildCommunityReport(
    {
      communities,
      members: [member("a"), member("b"), member("c"), member("all", { followsAllCommunities: true }), member("none")],
      memberships: [
        { memberId: "a", communityId: "c-tech", joinedAt: daysAgo(5) },
        { memberId: "b", communityId: "c-tech", joinedAt: daysAgo(60) },
        { memberId: "c", communityId: "c-health", joinedAt: daysAgo(40) },
        // A suspended/non-member account's row: not in `members`, so ignored.
        { memberId: "gone", communityId: "c-health", joinedAt: daysAgo(1) },
      ],
    },
    NOW,
  );

  it("ranks by direct joins, ties broken by name", () => {
    assert.deepEqual(
      report.communities.map((c) => [c.slug, c.directCount]),
      [["tech", 2], ["health", 1], ["arts", 0]],
    );
  });

  it("counts All followers separately and in the total", () => {
    const tech = report.communities[0];
    assert.equal(tech.viaAllCount, 1);
    assert.equal(tech.totalCount, 3);
    assert.equal(report.communities[2].totalCount, 1);
  });

  it("counts only joins inside the 30-day window as new", () => {
    assert.equal(report.communities[0].newCount, 1);
    assert.equal(report.communities[1].newCount, 0);
  });

  it("lists members newest join first", () => {
    assert.deepEqual(report.communities[0].members.map((m) => m.id), ["a", "b"]);
  });

  it("puts members with no community and no follow-all in unaffiliated", () => {
    assert.deepEqual(report.unaffiliated.map((m) => m.id), ["none"]);
    assert.deepEqual(report.allFollowers.map((m) => m.id), ["all"]);
    assert.equal(report.activeMemberCount, 5);
  });

  it("doesn't double count an All follower who also joined directly", () => {
    const r = buildCommunityReport(
      {
        communities,
        members: [member("x", { followsAllCommunities: true })],
        memberships: [{ memberId: "x", communityId: "c-arts", joinedAt: daysAgo(1) }],
      },
      NOW,
    );
    const arts = r.communities.find((c) => c.slug === "arts")!;
    assert.equal(arts.directCount, 1);
    assert.equal(arts.viaAllCount, 0);
    assert.equal(arts.totalCount, 1);
  });
});

describe("communityMembersCsv", () => {
  it("escapes quotes and formats the join date", () => {
    const csv = communityMembersCsv(
      [{ ...member("q", { name: 'Dr "Q"', country: "UK" }), joinedAt: new Date("2026-09-14T08:00:00Z") }],
      (id) => `https://example.org/members/${id}`,
    );
    assert.equal(
      csv.split("\n")[1],
      '"Dr ""Q""","q@example.org","","UK","2026-09-14","https://example.org/members/q"',
    );
  });
});
