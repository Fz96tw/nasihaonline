import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireRole } from "@/lib/auth";
import { Role } from "@/lib/generated/prisma/enums";
import { db } from "@/lib/db";
import { provisionMemberAccount } from "@/lib/clerk-admin";
import { sendWelcomeEmail } from "@/lib/email";
import { applicationReviewActionSchema } from "@/lib/validation/application-review";

const PENDING_STATUSES = new Set(["submitted", "under_review"]);

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  let admin;
  try {
    admin = await requireRole([Role.admin]);
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const parsed = applicationReviewActionSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const application = await db.membershipApplication.findUnique({ where: { id: params.id } });
  if (!application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }
  if (!PENDING_STATUSES.has(application.status)) {
    return NextResponse.json(
      { error: `Application already ${application.status}` },
      { status: 409 },
    );
  }

  if (parsed.data.action === "approve") {
    // Clerk provisioning happens before the DB write: if it fails, the
    // application stays in the pending queue for retry rather than being
    // marked approved with no account behind it.
    await provisionMemberAccount(application.email, Role.member, parsed.data.tier);

    const updated = await db.membershipApplication.update({
      where: { id: application.id },
      data: {
        status: "approved",
        assignedTier: parsed.data.tier,
        reviewedAt: new Date(),
        reviewedByEmail: admin.email,
      },
    });

    await sendWelcomeEmail(application.email, application.firstName);

    return NextResponse.json({ application: updated });
  }

  const updated = await db.membershipApplication.update({
    where: { id: application.id },
    data: {
      status: "rejected",
      adminNote: parsed.data.adminNote,
      adminNoteVisibleToApplicant: parsed.data.visibleToApplicant,
      reviewedAt: new Date(),
      reviewedByEmail: admin.email,
    },
  });

  return NextResponse.json({ application: updated });
}
