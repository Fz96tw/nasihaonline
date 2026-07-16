import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireRole } from "@/lib/auth";
import { Role } from "@/lib/generated/prisma/enums";
import { db } from "@/lib/db";
import { syncUserRoleTierToClerk } from "@/lib/clerk-admin";
import { userAdminActionSchema } from "@/lib/validation/user-admin";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  let admin;
  try {
    admin = await requireRole([Role.admin]);
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const parsed = userAdminActionSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const target = await db.user.findUnique({ where: { id: params.id } });
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (parsed.data.action === "suspend") {
    // An admin locking themselves out of /admin has no recovery path short
    // of a DB edit — block it here rather than relying on UI discipline.
    if (target.id === admin.id) {
      return NextResponse.json(
        { error: "You cannot suspend your own account" },
        { status: 400 },
      );
    }
    const updated = await db.user.update({
      where: { id: target.id },
      data: { suspended: true, suspendedAt: new Date() },
    });
    return NextResponse.json({ user: updated });
  }

  if (parsed.data.action === "reinstate") {
    const updated = await db.user.update({
      where: { id: target.id },
      data: { suspended: false, suspendedAt: null },
    });
    return NextResponse.json({ user: updated });
  }

  const { role, tier, reason } = parsed.data;

  // Clerk-first, same convention as the application-approval route: if
  // Clerk's metadata write fails, the DB never diverges from what Clerk
  // will re-sync on the next webhook.
  await syncUserRoleTierToClerk(target.clerkUserId, role, tier);

  const tierChanged = tier !== target.tier;

  const updated = await db.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: target.id },
      data: { role, tier },
    });
    // Audit trail only on an actual tier change (§7.3) — a role-only edit
    // that leaves tier untouched shouldn't add a no-op history row.
    if (tierChanged) {
      await tx.tierHistory.create({
        data: {
          userId: target.id,
          fromTier: target.tier,
          toTier: tier,
          changedByUserId: admin.id,
          reason: reason || null,
        },
      });
    }
    return user;
  });
  return NextResponse.json({ user: updated });
}
