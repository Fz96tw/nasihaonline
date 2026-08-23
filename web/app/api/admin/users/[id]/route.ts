import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireRole } from "@/lib/auth";
import { Role } from "@/lib/generated/prisma/enums";
import { db } from "@/lib/db";
import { deleteClerkUser, syncUserRoleTierToClerk } from "@/lib/clerk-admin";
import { recordAdminAction } from "@/lib/audit-server";
import { enqueueProfileIndexSync } from "@/lib/queues/search-index-queue";
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
    // A suspended member must drop out of the Directory (search included)
    // immediately rather than waiting on their next profile edit.
    await enqueueProfileIndexSync(target.id);
    return NextResponse.json({ user: updated });
  }

  if (parsed.data.action === "reinstate") {
    const updated = await db.user.update({
      where: { id: target.id },
      data: { suspended: false, suspendedAt: null },
    });
    await enqueueProfileIndexSync(target.id);
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

/**
 * Hard-deletes a user: Clerk-first (same convention as PATCH's role/tier
 * sync — Clerk is the source of truth and also fires the user.deleted
 * webhook as a backstop), then the local row directly rather than waiting
 * on that async webhook. Several relations to User are intentionally
 * un-cascaded (ContributionLedger, hosted Events, authored
 * KnowledgeItem/ForumThread/ForumPost, TierHistory, etc. — see
 * schema.prisma) so their history survives even if an account is removed;
 * for any user with such history this delete fails with a Postgres FK
 * violation (P2003), which we surface as a 409 rather than a crash. The
 * account is still gone from Clerk at that point (locked out of sign-in),
 * matching how a fulfilled §4.15 deletion request is handled today —
 * actually erasing that retained history remains a manual, offline step.
 */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  let admin;
  try {
    admin = await requireRole([Role.admin]);
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const target = await db.user.findUnique({ where: { id: params.id } });
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (target.id === admin.id) {
    return NextResponse.json({ error: "You cannot delete your own account" }, { status: 400 });
  }

  await deleteClerkUser(target.clerkUserId);

  try {
    await db.$transaction(async (tx) => {
      await tx.user.delete({ where: { id: target.id } });
      await recordAdminAction(
        {
          actorId: admin.id,
          action: "user.deleted",
          entityType: "User",
          entityId: target.id,
          metadata: { email: target.email, name: target.name },
        },
        tx,
      );
    });
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "P2003") {
      // Sign-in is already gone (Clerk account deleted above); reflect that
      // lockout locally too so the admin UI doesn't show a stale "Active".
      await db.user.update({
        where: { id: target.id },
        data: { suspended: true, suspendedAt: new Date() },
      });
      await enqueueProfileIndexSync(target.id);
      return NextResponse.json(
        {
          error:
            "This account's sign-in was removed, but it can't be fully deleted: it still has associated records (contributions, hosted events, authored content, etc.) that must be retained. Removing those first would require a manual, offline data-retention review.",
        },
        { status: 409 },
      );
    }
    throw error;
  }

  // Row (and its Profile, cascaded) is gone — this removes the now-stale
  // Meilisearch document rather than leaving it to be found as a dangling hit.
  await enqueueProfileIndexSync(target.id);

  return NextResponse.json({ deleted: true });
}
