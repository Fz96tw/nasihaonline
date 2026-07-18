import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireRole } from "@/lib/auth";
import { Role } from "@/lib/generated/prisma/enums";
import { getEventEngagementForAdmin } from "@/lib/events-server";
import { TIER_LABELS } from "@/lib/validation/application-review";

function toCsv(rows: Awaited<ReturnType<typeof getEventEngagementForAdmin>>): string {
  const header = ["Date", "Event", "Name", "Email", "Member"];
  const csvRows = rows.map((r) => [
    r.createdAt.toISOString(),
    r.eventTitle,
    r.name ?? "",
    r.email,
    r.isMember ? (r.tier ? TIER_LABELS[r.tier] : "Member") : "Non-member",
  ]);
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  return [header, ...csvRows].map((row) => row.map(escape).join(",")).join("\n");
}

// Moderator-or-admin view/export of event engagement — anonymous
// EventRegistration rows plus `going` RSVPs from members, mirroring
// /api/admin/donations — used to drive membership-campaign outreach.
export async function GET(request: Request) {
  try {
    await requireRole([Role.admin, Role.moderator]);
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const rows = await getEventEngagementForAdmin();

  const { searchParams } = new URL(request.url);
  if (searchParams.get("export") === "csv") {
    return new NextResponse(toCsv(rows), {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="event-registrations-${Date.now()}.csv"`,
      },
    });
  }

  return NextResponse.json({ rows });
}
