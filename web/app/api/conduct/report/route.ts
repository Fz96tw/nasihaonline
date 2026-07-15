import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { ConductError, createConductReport } from "@/lib/conduct-server";
import { createConductReportSchema } from "@/lib/validation/conduct";

/**
 * POST /api/conduct/report — "Report" on a Directory card (§4.15): any
 * member can report a concern about another member's conduct, creating an
 * open CodeOfConductViolation for admin review at /admin/conduct.
 */
export async function POST(request: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const parsed = createConductReportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const report = await createConductReport(user.id, parsed.data);
    return NextResponse.json({ id: report.id }, { status: 201 });
  } catch (error) {
    if (error instanceof ConductError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
