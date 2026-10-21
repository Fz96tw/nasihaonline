import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireRole } from "@/lib/auth";
import { Role } from "@/lib/generated/prisma/enums";
import { getCommunityMembershipReport } from "@/lib/community-report-server";
import { communityMembersCsv } from "@/lib/community-report";

// CSV export of one group from /admin/reports/communities:
// ?group=<communityId> (its direct members), ?group=all (follow-all
// members), or ?group=none (members in no community).
export async function GET(request: Request) {
  try {
    await requireRole([Role.admin]);
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const url = new URL(request.url);
  const group = url.searchParams.get("group");
  const report = await getCommunityMembershipReport();

  let rows;
  let slug: string;
  if (group === "all") {
    rows = report.allFollowers;
    slug = "all-communities";
  } else if (group === "none") {
    rows = report.unaffiliated;
    slug = "no-community";
  } else {
    const community = report.communities.find((c) => c.id === group);
    if (!community) return NextResponse.json({ error: "Unknown group" }, { status: 404 });
    rows = community.members;
    slug = community.slug;
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL || url.origin;
  const csv = communityMembersCsv(rows, (id) => `${origin}/members/${id}`);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="community-${slug}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
