import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { LedgerStatus, LedgerTransactionType, ContributionSource } from "@/lib/generated/prisma/enums";
import { logContributionSchema } from "@/lib/validation/contribution";

/**
 * Self-report path of the §4.4 hybrid posting model: "everything without a
 * system-of-record trigger" (curating a resource, an ad-hoc knowledge
 * discussion, admin volunteer work, etc.) is submitted here and always
 * enters as `pending` — it never touches the balance until a counterpart or
 * admin confirms it (§4.4, confirm/reject endpoints are a separate
 * objective). Auto-posted earn transactions (event hosting) and spend
 * transactions (accepted meeting requests) have no path through this route.
 */
export async function POST(request: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    throw error;
  }

  const parsed = logContributionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { activityKey, counterpartUserId, note } = parsed.data;

  const rule = await db.contributionRule.findUnique({ where: { activityKey } });
  if (!rule || !rule.active || rule.type !== LedgerTransactionType.earned) {
    return NextResponse.json({ error: "Unknown or inactive activity." }, { status: 400 });
  }

  if (counterpartUserId) {
    if (counterpartUserId === user.id) {
      return NextResponse.json({ error: "You can't name yourself as the counterpart." }, { status: 400 });
    }
    const counterpart = await db.user.findUnique({ where: { id: counterpartUserId } });
    if (!counterpart) {
      return NextResponse.json({ error: "Selected counterpart could not be found." }, { status: 400 });
    }
  }

  const ledgerEntry = await db.$transaction(async (tx) => {
    const event = await tx.contributionEvent.create({
      data: {
        ruleId: rule.id,
        actorId: user.id,
        counterpartId: counterpartUserId,
        note,
        source: ContributionSource.self_reported,
      },
    });

    return tx.contributionLedger.create({
      data: {
        userId: user.id,
        eventId: event.id,
        type: LedgerTransactionType.earned,
        status: LedgerStatus.pending,
        hours: rule.hours,
      },
    });
  });

  return NextResponse.json({ id: ledgerEntry.id }, { status: 201 });
}
