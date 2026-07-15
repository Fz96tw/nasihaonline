import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireRole } from "@/lib/auth";
import { Role } from "@/lib/generated/prisma/enums";
import { ConductError, getOpenConductReports, recordConductAction } from "@/lib/conduct-server";
import { conductActionSchema } from "@/lib/validation/conduct";

/** GET /api/admin/conduct — open reports backing /admin/conduct, each with the reported member's prior (already-actioned) violation history. */
export async function GET() {
  try {
    await requireRole([Role.admin]);
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const reports = await getOpenConductReports();
  return NextResponse.json({ reports });
}

/** PATCH /api/admin/conduct — records an admin's warning/suspension/removal on an open report; suspension/removal also invokes 6.2's suspension mechanism. */
export async function PATCH(request: Request) {
  let admin;
  try {
    admin = await requireRole([Role.admin]);
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const parsed = conductActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const report = await recordConductAction(parsed.data.id, admin.id, parsed.data.action);
    return NextResponse.json({ report });
  } catch (error) {
    if (error instanceof ConductError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
