import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { AuthError, authErrorResponse, requireRole } from "@/lib/auth";
import { Role } from "@/lib/generated/prisma/enums";
import { db } from "@/lib/db";
import { reorderSchema } from "@/lib/validation/team-member";

export async function POST(request: Request) {
  try {
    await requireRole([Role.admin]);
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const parsed = reorderSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await db.$transaction(
    parsed.data.orderedIds.map((id, index) =>
      db.teamMember.update({ where: { id }, data: { displayOrder: index } }),
    ),
  );

  revalidatePath("/our-team");

  return NextResponse.json({ ok: true });
}
