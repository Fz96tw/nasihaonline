import "server-only";
import { db } from "@/lib/db";
import { ContributionSource, LedgerStatus, LedgerTransactionType, MeetingRequestStatus } from "@/lib/generated/prisma/enums";
import type { MeetingRequestModel } from "@/lib/generated/prisma/models/MeetingRequest";

/** The rate-card key that prices an accepted meeting request's spend side (§4.4, seeded in prisma/seed.ts). */
const EXPERT_CONSULTATION_ACTIVITY_KEY = "expert_consultation";
/** The rate-card key for the recipient's system-generated earn side (§11's resolved open question #12). */
const KNOWLEDGE_DISCUSSION_ACTIVITY_KEY = "knowledge_discussion";

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
 * Accepting posts two ledger rows (§4.4/§11's resolved open question #12):
 * an already-`confirmed` `spent` row for the requester at the Expert
 * Consultation rate (no separate confirmation step — the system has full
 * ground truth here), and a system-generated but still `pending` `earned`
 * row for the recipient at the Knowledge discussion rate, naming the
 * requester as counterpart. The recipient doesn't type anything to create
 * their entry, but it still needs the requester's peer confirmation before
 * counting toward the recipient's balance — a deliberate anti-fraud check
 * so the recipient can't unilaterally credit themselves for a meeting.
 * Both links are set in the same transaction as the status flip so none of
 * the three can diverge.
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

  const [spendRule, earnRule] = await Promise.all([
    db.contributionRule.findUnique({ where: { activityKey: EXPERT_CONSULTATION_ACTIVITY_KEY } }),
    db.contributionRule.findUnique({ where: { activityKey: KNOWLEDGE_DISCUSSION_ACTIVITY_KEY } }),
  ]);
  if (!spendRule || !spendRule.active || spendRule.type !== LedgerTransactionType.spent) {
    throw new MeetingRequestError(409, "Expert Consultation rate isn't configured.");
  }
  if (!earnRule || !earnRule.active || earnRule.type !== LedgerTransactionType.earned) {
    throw new MeetingRequestError(409, "Knowledge discussion rate isn't configured.");
  }

  return db.$transaction(async (tx) => {
    const spendEvent = await tx.contributionEvent.create({
      data: {
        ruleId: spendRule.id,
        actorId: meetingRequest.senderId,
        counterpartId: meetingRequest.recipientId,
        note: `Meeting: ${meetingRequest.topic}`,
        source: ContributionSource.meeting_request,
      },
    });

    const spendLedgerEntry = await tx.contributionLedger.create({
      data: {
        userId: meetingRequest.senderId,
        eventId: spendEvent.id,
        type: LedgerTransactionType.spent,
        status: LedgerStatus.confirmed,
        hours: spendRule.hours.negated(),
      },
    });

    // Recipient's earn — system-generated, naming the requester as the
    // counterpart who must confirm it (same pending -> confirmed|rejected
    // path any other counterpart-confirmed entry follows, per §4.4).
    const earnEvent = await tx.contributionEvent.create({
      data: {
        ruleId: earnRule.id,
        actorId: meetingRequest.recipientId,
        counterpartId: meetingRequest.senderId,
        note: `Meeting: ${meetingRequest.topic}`,
        source: ContributionSource.meeting_request,
      },
    });

    const earnLedgerEntry = await tx.contributionLedger.create({
      data: {
        userId: meetingRequest.recipientId,
        eventId: earnEvent.id,
        type: LedgerTransactionType.earned,
        status: LedgerStatus.pending,
        hours: earnRule.hours,
      },
    });

    return tx.meetingRequest.update({
      where: { id: meetingRequestId },
      data: {
        status: MeetingRequestStatus.accepted,
        contributionLedgerId: spendLedgerEntry.id,
        recipientContributionLedgerId: earnLedgerEntry.id,
      },
    });
  });
}
