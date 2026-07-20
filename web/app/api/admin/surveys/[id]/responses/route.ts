import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireRole } from "@/lib/auth";
import { Role } from "@/lib/generated/prisma/enums";
import { getSurveyResponses, type SurveyResponsesData } from "@/lib/surveys-server";

function escapeCsv(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

// One row per respondent, columns = fixed identity fields + one column per
// question in display order — same manual toCsv() shape as
// /api/admin/donations and /api/admin/event-registrations.
function toCsv(data: SurveyResponsesData): string {
  const header = ["Name", "Email", "Submitted At", ...data.questions.map((question) => question.prompt)];
  const rows = data.rows.map((row) => [
    row.respondentName ?? "",
    row.respondentEmail,
    row.submittedAt,
    ...data.questions.map((question) => (row.answers[question.id] ?? []).join("; ")),
  ]);
  return [header, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n");
}

/**
 * GET /api/admin/surveys/:id/responses — response viewer data, admin-only.
 * `?export=csv` returns the same rows as a downloadable CSV instead of JSON.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireRole([Role.admin]);
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const data = await getSurveyResponses(params.id);
  if (!data) return NextResponse.json({ error: "Survey not found." }, { status: 404 });

  const { searchParams } = new URL(request.url);
  if (searchParams.get("export") === "csv") {
    return new NextResponse(toCsv(data), {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="survey-${params.id}-responses-${Date.now()}.csv"`,
      },
    });
  }

  return NextResponse.json(data);
}
