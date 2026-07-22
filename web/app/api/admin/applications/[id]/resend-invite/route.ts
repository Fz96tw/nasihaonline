import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireRole } from "@/lib/auth";
import { Role } from "@/lib/generated/prisma/enums";
import { db } from "@/lib/db";
import { resendMemberInvitation } from "@/lib/clerk-admin";
import { sendWelcomeEmail } from "@/lib/email";

/**
 * Re-sends the Clerk sign-up invite + welcome email for an already-approved
 * application whose applicant never completed (or never received) it —
 * unlike the approve action in ../route.ts, failures here are surfaced to
 * the admin rather than logged-and-swallowed, since this is an explicit
 * retry the admin is watching for confirmation of.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireRole([Role.admin]);
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const application = await db.membershipApplication.findUnique({ where: { id: params.id } });
  if (!application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }
  if (application.status !== "approved" || !application.assignedTier) {
    return NextResponse.json(
      { error: "Only approved applications have an invite to resend" },
      { status: 409 },
    );
  }

  const existingUser = await db.user.findUnique({ where: { email: application.email } });
  if (existingUser) {
    return NextResponse.json(
      { error: "This applicant already has an account — they should use Sign In (or Forgot Password) instead." },
      { status: 409 },
    );
  }

  const invitation = await resendMemberInvitation(
    application.email,
    Role.member,
    application.assignedTier,
    application.firstName,
    application.lastName,
  );

  if (!invitation.url) {
    return NextResponse.json(
      { error: "Clerk didn't return an invite link — check server logs." },
      { status: 502 },
    );
  }

  await sendWelcomeEmail(application.email, application.firstName, application.assignedTier, invitation.url);

  return NextResponse.json({ ok: true });
}
