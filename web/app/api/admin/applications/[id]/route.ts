import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireRole } from "@/lib/auth";
import { Role } from "@/lib/generated/prisma/enums";
import { db } from "@/lib/db";
import { provisionMemberAccount } from "@/lib/clerk-admin";
import { sendWelcomeEmail } from "@/lib/email";
import { applicationReviewActionSchema } from "@/lib/validation/application-review";
import { recordAdminAction } from "@/lib/audit-server";

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
    const { tier } = parsed.data;
    // Clerk provisioning happens before the DB write: if it fails, the
    // application stays in the pending queue for retry rather than being
    // marked approved with no account behind it.
    const invitation = await provisionMemberAccount(
      application.email,
      Role.member,
      tier,
      application.firstName,
      application.lastName,
    );

    const updated = await db.$transaction(async (tx) => {
      const application_ = await tx.membershipApplication.update({
        where: { id: application.id },
        data: {
          status: "approved",
          assignedTier: tier,
          reviewedAt: new Date(),
          reviewedByEmail: admin.email,
          lastInvitedAt: new Date(),
        },
      });
      await recordAdminAction(
        { actorId: admin.id, action: "application.approved", entityType: "MembershipApplication", entityId: application.id },
        tx,
      );
      return application_;
    });

    let emailStatus: { ok: boolean; error?: string };
    if (invitation.url) {
      const result = await sendWelcomeEmail(application.email, application.firstName, tier, invitation.url);
      emailStatus = result.ok ? { ok: true } : { ok: false, error: result.error };
    } else {
      const error = `Clerk invitation ${invitation.id} has no url`;
      console.error(`[email] ${error} for ${application.email} — skipping welcome email`);
      emailStatus = { ok: false, error };
    }

    return NextResponse.json({ application: updated, emailStatus });
  }

  const { adminNote, visibleToApplicant } = parsed.data;
  const updated = await db.$transaction(async (tx) => {
    const application_ = await tx.membershipApplication.update({
      where: { id: application.id },
      data: {
        status: "rejected",
        adminNote,
        adminNoteVisibleToApplicant: visibleToApplicant,
        reviewedAt: new Date(),
        reviewedByEmail: admin.email,
      },
    });
    await recordAdminAction(
      { actorId: admin.id, action: "application.rejected", entityType: "MembershipApplication", entityId: application.id },
      tx,
    );
    return application_;
  });

  return NextResponse.json({ application: updated });
}
