import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, authErrorResponse, requireRole } from "@/lib/auth";
import { Role } from "@/lib/generated/prisma/enums";
import { reopenSurvey, SurveyError } from "@/lib/surveys-server";

const reopenSchema = z.object({
  durationDays: z.number().int().min(1).max(365).nullable(),
});

/**
 * POST /api/admin/surveys/:id/reopen — manual reopen of a closed survey,
 * admin-only. Body optionally sets a fresh auto-close duration; omitted or
 * null leaves it open until manually closed again.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireRole([Role.admin]);
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const body = await request.json().catch(() => ({}));
  const parsed = reopenSchema.safeParse({ durationDays: body?.durationDays ?? null });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    await reopenSurvey(params.id, parsed.data.durationDays);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof SurveyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
