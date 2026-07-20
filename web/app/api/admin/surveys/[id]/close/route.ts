import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireRole } from "@/lib/auth";
import { Role } from "@/lib/generated/prisma/enums";
import { closeSurvey, SurveyError } from "@/lib/surveys-server";

/** POST /api/admin/surveys/:id/close — manual close of an open survey, admin-only. */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireRole([Role.admin]);
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  try {
    await closeSurvey(params.id, user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof SurveyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
