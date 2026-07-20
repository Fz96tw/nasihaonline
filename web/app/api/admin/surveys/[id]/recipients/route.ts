import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireRole } from "@/lib/auth";
import { Role } from "@/lib/generated/prisma/enums";
import { getSurveyRecipients, type SurveyRecipientRow } from "@/lib/surveys-server";

const SOURCE_LABELS: Record<string, string> = {
  member: "Member",
  donor: "Donor",
  event_registrant: "Event Registrant",
};

function escapeCsv(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function toCsv(recipients: SurveyRecipientRow[]): string {
  const header = ["Name", "Email", "Source", "Sent At", "Responded", "Responded At"];
  const rows = recipients.map((recipient) => [
    recipient.name ?? "",
    recipient.email,
    SOURCE_LABELS[recipient.source] ?? recipient.source,
    recipient.sentAt ?? "",
    recipient.respondedAt ? "yes" : "no",
    recipient.respondedAt ?? "",
  ]);
  return [header, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n");
}

/**
 * GET /api/admin/surveys/:id/recipients — delivery/response status roster,
 * admin-only: who a survey was sent to and whether they've responded yet.
 * `?export=csv` returns the same rows as a downloadable CSV.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireRole([Role.admin]);
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const data = await getSurveyRecipients(params.id);
  if (!data) return NextResponse.json({ error: "Survey not found." }, { status: 404 });

  const { searchParams } = new URL(request.url);
  if (searchParams.get("export") === "csv") {
    return new NextResponse(toCsv(data.recipients), {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="survey-${params.id}-recipients-${Date.now()}.csv"`,
      },
    });
  }

  return NextResponse.json(data);
}
