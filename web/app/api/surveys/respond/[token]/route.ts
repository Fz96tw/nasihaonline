import { NextResponse } from "next/server";
import { submitSurveyResponseSchema } from "@/lib/validation/survey";
import { submitSurveyResponse, SurveyError } from "@/lib/surveys-server";

/**
 * POST /api/surveys/respond/:token — public, no session required. The
 * token itself (a SurveyInvitation.token, unguessable, emailed only to the
 * resolved recipient) is the authentication for this endpoint — the same
 * "the link is the credential" model as every magic-link flow, deliberately
 * chosen (§ compose flow decision) so members and non-members share one
 * response path with no login wall.
 */
export async function POST(request: Request, { params }: { params: { token: string } }) {
  const body = await request.json().catch(() => null);
  const parsed = submitSurveyResponseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    await submitSurveyResponse(params.token, parsed.data.answers);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof SurveyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
