import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAdmissionPhase } from "@/lib/settings";
import { applicationSchema } from "@/lib/validation/application";
import { sendApplicationConfirmationEmail } from "@/lib/email";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { findDuplicateApplicant } from "@/lib/applications";

const DUPLICATE_EMAIL_MESSAGES = {
  existing_member: "This email is already associated with a member account.",
  pending_application: "An application with this email is already under review.",
} as const;

export async function POST(request: Request) {
  const { success } = await rateLimit(`applications:${clientIp(request)}`, {
    limit: 5,
    windowSeconds: 60 * 60,
  });
  if (!success) {
    return NextResponse.json({ error: "Too many applications. Please try again later." }, { status: 429 });
  }

  const phase = await getAdmissionPhase();
  const parsed = applicationSchema(phase).safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { codeOfConductAccepted, requestedTier, ...applicationFields } = parsed.data;
  if (!codeOfConductAccepted) {
    return NextResponse.json({ error: "Code of Conduct acceptance is required" }, { status: 400 });
  }

  const duplicateReason = await findDuplicateApplicant(applicationFields.email);
  if (duplicateReason) {
    return NextResponse.json(
      { error: { fieldErrors: { email: [DUPLICATE_EMAIL_MESSAGES[duplicateReason]] } } },
      { status: 409 },
    );
  }

  const application = await db.membershipApplication.create({
    data: {
      ...applicationFields,
      requestedTier: requestedTier || null,
      codeOfConductAcceptedAt: new Date(),
    },
  });

  await sendApplicationConfirmationEmail(application.email, application.firstName);

  return NextResponse.json({ id: application.id }, { status: 201 });
}
