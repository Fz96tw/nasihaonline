import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { PrivacyError, createPrivacyDataRequest } from "@/lib/privacy-server";
import { createPrivacyDataRequestSchema } from "@/lib/validation/privacy";

/**
 * POST /api/privacy/requests — a member requests export or deletion of
 * their personal data from the Settings Privacy section (§4.15), creating
 * an open PrivacyDataRequest routed to admins for fulfillment at
 * /admin/privacy-requests.
 */
export async function POST(request: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const parsed = createPrivacyDataRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const privacyRequest = await createPrivacyDataRequest(user.id, parsed.data.type);
    return NextResponse.json({ privacyRequest }, { status: 201 });
  } catch (error) {
    if (error instanceof PrivacyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
