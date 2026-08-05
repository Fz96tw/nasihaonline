import { NextResponse } from "next/server";
import { db } from "@/lib/db";
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

  const parsed = applicationSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { codeOfConductAccepted, requestedTier, howHeardMemberName, howHeardOtherDetail, ...applicationFields } =
    parsed.data;
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
      professionalTitle: applicationFields.professionalTitle || null,
      linkedinUrl: applicationFields.linkedinUrl || null,
      howHeardMemberName: howHeardMemberName || null,
      howHeardOtherDetail: howHeardOtherDetail || null,
      requestedTier: requestedTier || null,
      codeOfConductAcceptedAt: new Date(),
      // Legacy vetting fields (see MembershipApplication's schema comment)
      // are no longer collected on /join — explicitly blanked, same
      // convention as autoSubmitFriendApplication.
      careerStage: null,
      availability: [],
      interestAreas: [],
      referral: null,
      whyJoin: null,
      expertiseToShare: null,
      topicsToLearn: null,
      professionalReferenceName: null,
      professionalReferenceContact: null,
    },
  });

  await sendApplicationConfirmationEmail(application);

  return NextResponse.json({ id: application.id }, { status: 201 });
}
