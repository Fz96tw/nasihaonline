import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireRole } from "@/lib/auth";
import { Role } from "@/lib/generated/prisma/enums";
import { getEventRegistrationsForAdmin } from "@/lib/events-server";

function toCsv(
  registrations: Awaited<ReturnType<typeof getEventRegistrationsForAdmin>>,
): string {
  const header = ["Date", "Event", "Name", "Email"];
  const rows = registrations.map((r) => [
    r.createdAt.toISOString(),
    r.event.title,
    r.name ?? "",
    r.email,
  ]);
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  return [header, ...rows].map((row) => row.map(escape).join(",")).join("\n");
}

// Moderator-or-admin view/export of anonymous event registrations, mirroring
// /api/admin/donations — used to drive membership-campaign outreach to
// people who attended an open event but never signed up.
export async function GET(request: Request) {
  try {
    await requireRole([Role.admin, Role.moderator]);
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const registrations = await getEventRegistrationsForAdmin();

  const { searchParams } = new URL(request.url);
  if (searchParams.get("export") === "csv") {
    return new NextResponse(toCsv(registrations), {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="event-registrations-${Date.now()}.csv"`,
      },
    });
  }

  return NextResponse.json({ registrations });
}
