import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireRole } from "@/lib/auth";
import { Role } from "@/lib/generated/prisma/enums";
import { createSurveySchema } from "@/lib/validation/survey";
import { createSurvey, getSurveyDetail, SurveyError } from "@/lib/surveys-server";
import { UploadValidationError } from "@/lib/storage";

/**
 * POST /api/admin/surveys — "Compose Survey", admin-only. Always creates a
 * new draft Survey row (used for both a blank compose and a "use as
 * template" resend, which pre-fills the client form but still POSTs fresh —
 * same never-mutate-a-past-record convention as Announcements' fromId
 * resend). Multipart, not JSON — the optional cover image travels alongside
 * the rest of the fields (sent as a single "payload" JSON field, since
 * `questions` is a nested array too awkward to flatten into individual
 * FormData keys) — same pattern as POST /api/admin/announcements.
 * `action` decides whether the new draft stays a draft or is immediately
 * scheduled/sent.
 */
export async function POST(request: Request) {
  let user;
  try {
    user = await requireRole([Role.admin]);
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

  // "Use as template" resend (?fromId=<id> on the compose page): reuse the
  // source survey's already-uploaded cover image key when the admin didn't
  // pick a new file. Looked up server-side by id rather than trusting a
  // client-supplied key directly, so an admin can't point heroImageUrl at
  // an arbitrary storage key — same rationale as the Announcement route.
  const fromId = formData.get("fromId");
  let templateHeroImageUrl: string | null = null;
  if (typeof fromId === "string" && fromId) {
    const template = await getSurveyDetail(fromId);
    templateHeroImageUrl = template?.heroImageUrl ?? null;
  }

  try {
    const survey = await createSurvey(user.id, parsed.data, { heroImage, templateHeroImageUrl });
    return NextResponse.json({ id: survey.id }, { status: 201 });
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
