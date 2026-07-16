import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireRole } from "@/lib/auth";
import { Role } from "@/lib/generated/prisma/enums";
import { createLedgerAdjustment, LedgerAdjustmentError } from "@/lib/contributions-server";
import { adjustLedgerSchema } from "@/lib/validation/ledger-adjustment";

/**
 * Manual ledger correction (§4.4/§4.11 "ledger auditing") — the only way an
 * admin can move a member's balance outside normal earn/spend. Always
 * posted `confirmed`; see createLedgerAdjustment for why.
 */
export async function POST(request: Request) {
  let admin;
  try {
    admin = await requireRole([Role.admin]);
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const parsed = adjustLedgerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { userId, hours, reason } = parsed.data;

  try {
    const entry = await createLedgerAdjustment(admin, userId, hours, reason);
    return NextResponse.json({ id: entry.id }, { status: 201 });
  } catch (error) {
    if (error instanceof LedgerAdjustmentError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
