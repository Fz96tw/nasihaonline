import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireRole } from "@/lib/auth";
import { Role } from "@/lib/generated/prisma/enums";
import { db } from "@/lib/db";
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

  const updated = await db.user.update({
    where: { id: target.id },
    data: { role: parsed.data.role, tier: parsed.data.tier },
  });
  return NextResponse.json({ user: updated });
}
