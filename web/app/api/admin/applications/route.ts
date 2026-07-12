import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireRole } from "@/lib/auth";
import { Role } from "@/lib/generated/prisma/enums";
import { db } from "@/lib/db";
import { buildApplicationFilterWhere } from "@/lib/applications";

export async function GET(request: Request) {
  try {
    await requireRole([Role.admin]);
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const { searchParams } = new URL(request.url);
  const where = buildApplicationFilterWhere(
    searchParams.get("status"),
    searchParams.get("referral"),
  );

  const applications = await db.membershipApplication.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ applications });
}
