import "server-only";
import { db } from "@/lib/db";
import { ContributionSource, LedgerStatus, LedgerTransactionType, MeetingRequestStatus } from "@/lib/generated/prisma/enums";
import type { MeetingRequestModel } from "@/lib/generated/prisma/models/MeetingRequest";

/** The rate-card key that prices an accepted meeting request (§4.4's spend table, seeded in prisma/seed.ts). */
const EXPERT_CONSULTATION_ACTIVITY_KEY = "expert_consultation";

export class MeetingRequestError extends Error {
  constructor(
    public readonly status: 400 | 403 | 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

function parseProposedTimes(values: string[]): Date[] {
  const parsed = values.map((value) => new Date(value));
  if (parsed.some((date) => Number.isNaN(date.getTime()))) {
    throw new MeetingRequestError(400, "One or more proposed times isn't a valid date/time.");
  }
  return parsed;
}

/**
 * Creates a MeetingRequest from a Directory card's "Request Meeting" action
 * (§4.7). Always starts `pending` — acceptance (and its ledger auto-spend)
 * happens exclusively through resolveMeetingRequest().
 */
export async function createMeetingRequest(
  senderId: string,
  input: { recipientId: string; topic: string; proposedTimes: string[]; message: string | null },
): Promise<MeetingRequestModel> {
  if (input.recipientId === senderId) {
    throw new MeetingRequestError(400, "You can't request a meeting with yourself.");
  }

  const recipient = await db.user.findUnique({ where: { id: input.recipientId } });
  if (!recipient) throw new MeetingRequestError(404, "Recipient not found.");

  const proposedTimes = parseProposedTimes(input.proposedTimes);

  return db.meetingRequest.create({
    data: {
      senderId,
      recipientId: input.recipientId,
      topic: input.topic,
      proposedTimes,
      message: input.message,
    },
  });
}

type ResolveAction =
  | { action: "accept" }
  | { action: "decline" }
  | { action: "reschedule"; proposedTimes: string[]; message: string | null };

/**
 * Applies the recipient's response to a pending meeting request (§4.7):
 * accept, decline, or propose a new time. Only the recipient may act — the
 * requester just watches the status change.
 *
 * Accepting is the ledger's auto-spend trigger (§4.4): it posts an already-
 * `confirmed` (no separate confirmation step) `spent` ContributionLedger row
 * for the requester at the Expert Consultation rate, linked back via
 * `contributionLedgerId`, in the same transaction as the status flip so the
 * two can never diverge.
 */
export async function resolveMeetingRequest(
  meetingRequestId: string,
  actingUserId: string,
  action: ResolveAction,
): Promise<MeetingRequestModel> {
  const meetingRequest = await db.meetingRequest.findUnique({ where: { id: meetingRequestId } });
  if (!meetingRequest) throw new MeetingRequestError(404, "Meeting request not found.");
  if (meetingRequest.recipientId !== actingUserId) {
    throw new MeetingRequestError(403, "Only the recipient can respond to this meeting request.");
  }
  if (meetingRequest.status !== MeetingRequestStatus.pending) {
    throw new MeetingRequestError(409, `This meeting request is already ${meetingRequest.status}.`);
  }

  if (action.action === "decline") {
    return db.meetingRequest.update({
      where: { id: meetingRequestId },
      data: { status: MeetingRequestStatus.declined },
    });
  }

  if (action.action === "reschedule") {
    const proposedTimes = parseProposedTimes(action.proposedTimes);
    return db.meetingRequest.update({
      where: { id: meetingRequestId },
      data: { status: MeetingRequestStatus.rescheduled, proposedTimes, message: action.message },
    });
  }

  const rule = await db.contributionRule.findUnique({ where: { activityKey: EXPERT_CONSULTATION_ACTIVITY_KEY } });
  if (!rule || !rule.active || rule.type !== LedgerTransactionType.spent) {
    throw new MeetingRequestError(409, "Expert Consultation rate isn't configured.");
  }

  return db.$transaction(async (tx) => {
    const event = await tx.contributionEvent.create({
      data: {
        ruleId: rule.id,
        actorId: meetingRequest.senderId,
        counterpartId: meetingRequest.recipientId,
        note: `Meeting: ${meetingRequest.topic}`,
        source: ContributionSource.meeting_request,
      },
    });

    const ledgerEntry = await tx.contributionLedger.create({
      data: {
        userId: meetingRequest.senderId,
        eventId: event.id,
        type: LedgerTransactionType.spent,
        status: LedgerStatus.confirmed,
        hours: rule.hours.negated(),
      },
    });

    return tx.meetingRequest.update({
      where: { id: meetingRequestId },
      data: { status: MeetingRequestStatus.accepted, contributionLedgerId: ledgerEntry.id },
    });
  });
}
