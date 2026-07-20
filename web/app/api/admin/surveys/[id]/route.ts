import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireRole } from "@/lib/auth";
import { Role } from "@/lib/generated/prisma/enums";
import { createSurveySchema } from "@/lib/validation/survey";
import { getSurveyDetail, updateDraftSurvey, SurveyError } from "@/lib/surveys-server";
import { UploadValidationError } from "@/lib/storage";

/** GET /api/admin/surveys/:id — full compose-shape detail, admin-only. */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireRole([Role.admin]);
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const survey = await getSurveyDetail(params.id);
  if (!survey) return NextResponse.json({ error: "Survey not found." }, { status: 404 });
  return NextResponse.json({ survey });
}

/**
 * PATCH /api/admin/surveys/:id — edits a still-draft survey in place, or
 * (via `action: "send"`) transitions it out of draft. Admin-only; rejected
 * with 409 once the survey is no longer a draft — updateDraftSurvey enforces
 * that, not this route. Multipart, same "payload" JSON field + optional
 * heroImage file shape as POST /api/admin/surveys — a new file replaces the
 * existing cover image, an omitted one leaves it untouched.
 */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireRole([Role.admin]);
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const formData = await request.formData();
  const payload = JSON.parse(String(formData.get("payload") ?? "null"));
  const parsed = createSurveySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const heroImageField = formData.get("heroImage");
  const heroImage = heroImageField instanceof File && heroImageField.size > 0 ? heroImageField : null;

  try {
    const survey = await updateDraftSurvey(params.id, parsed.data, { heroImage });
    return NextResponse.json({ id: survey.id });
  } catch (error) {
    if (error instanceof UploadValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof SurveyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
