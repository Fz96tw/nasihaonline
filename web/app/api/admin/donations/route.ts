import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireRole } from "@/lib/auth";
import { Role } from "@/lib/generated/prisma/enums";
import { db } from "@/lib/db";

function toCsv(
  donations: Awaited<ReturnType<typeof db.donation.findMany>>,
): string {
  const header = [
    "Date",
    "Donor Name",
    "Donor Email",
    "Linked Member",
    "Amount",
    "Currency",
    "Frequency",
    "Recognition Consent",
    "Email Updates Opt-In",
    "Note",
  ];
  const rows = donations.map((d) => [
    d.createdAt.toISOString(),
    d.donorName,
    d.donorEmail,
    d.userId ?? "",
    (d.amountCents / 100).toFixed(2),
    d.currency,
    d.frequency,
    d.recognitionConsent ? "yes" : "no",
    d.emailUpdatesOptIn ? "yes" : "no",
    d.note ?? "",
  ]);
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  return [header, ...rows].map((row) => row.map(escape).join(",")).join("\n");
}

// Admin-only view/export of donation records (PRD §4.14). Read-only with
// respect to the donation data itself — there is no route anywhere that
// writes from a Donation into ContributionLedger or users.tier.
export async function GET(request: Request) {
  try {
    await requireRole([Role.admin]);
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const donations = await db.donation.findMany({ orderBy: { createdAt: "desc" } });

  const { searchParams } = new URL(request.url);
  if (searchParams.get("export") === "csv") {
    return new NextResponse(toCsv(donations), {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="donations-${Date.now()}.csv"`,
      },
    });
  }

  return NextResponse.json({ donations });
}
