import "server-only";
import { db } from "@/lib/db";
import {
  ContributionSource,
  LedgerStatus,
  LedgerTransactionType,
  MeetingRequestMessageAction,
  MeetingRequestStatus,
  NotificationType,
} from "@/lib/generated/prisma/enums";
import type { MeetingRequestModel } from "@/lib/generated/prisma/models/MeetingRequest";
import { sendMeetingRequestEmail } from "@/lib/email";
import { cancelMeetingCalendarEvent, createMeetingCalendarEvent } from "@/lib/google-calendar";
import { INBOX_TIERS } from "@/lib/members";
import { createNotification } from "@/lib/notifications-server";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";

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

  const [recipient, sender] = await Promise.all([
    db.user.findUnique({ where: { id: input.recipientId } }),
    db.user.findUnique({ where: { id: senderId }, select: { name: true } }),
  ]);
  if (!recipient || !recipient.tier || !INBOX_TIERS.includes(recipient.tier)) {
    throw new MeetingRequestError(404, "Recipient not found.");
  }

  const proposedTimes = parseProposedTimes(input.proposedTimes);

  const meetingRequest = await db.$transaction(async (tx) => {
    const created = await tx.meetingRequest.create({
      data: {
        senderId,
        recipientId: input.recipientId,
        topic: input.topic,
        proposedTimes,
      },
    });
    await tx.meetingRequestMessage.create({
      data: {
        meetingRequestId: created.id,
        senderId,
        action: MeetingRequestMessageAction.created,
        body: input.message,
        proposedTimes,
      },
    });
    return created;
  });

  const link = `/inbox?item=${meetingRequest.id}`;
  const notificationMessage = `${sender?.name ?? "A member"} requested a meeting: "${input.topic}"`;
  await createNotification({
    recipientId: input.recipientId,
    type: NotificationType.meeting_request_received,
    message: notificationMessage,
    link,
  });
  // The email gets a fuller note than the terse in-app Notification.message
  // — at this pending stage there's no Meet link yet (Google only creates
  // the event on acceptance, in resolveMeetingRequest), so this reassures
  // the recipient it *will* be one rather than showing a link that doesn't
  // exist yet.
  await sendMeetingRequestEmail(recipient.email, recipient.name ?? "there", {
    subject: `New meeting request: ${input.topic}`,
    message: `${notificationMessage} If you accept, a Google Meet video link will be created automatically and emailed to you both.`,
    link: `${APP_URL}${link}`,
  });

  return meetingRequest;
}

type ResolveAction =
  | { action: "accept"; selectedTime?: string }
  | { action: "decline" }
  | { action: "reschedule"; proposedTimes: string[]; message: string | null }
  | { action: "cancel" }
  | { action: "edit"; topic: string; message: string | null };

/**
 * Cancels a meeting request (§4.7 follow-up), in either of two states with
 * different permission rules:
 *  - `pending`/`rescheduled`: only the original sender may withdraw the
 *    whole negotiation, regardless of whose turn it currently is to
 *    respond — whichever party currently holds the turn already has
 *    "decline" for this case, so letting them also "cancel" would just be
 *    a confusing second path to the same thing. No Google event exists yet
 *    at this stage.
 *  - `accepted`: either party may cancel — deletes the Google Calendar
 *    event (Google's own cancellation email covers both attendees, same
 *    no-duplicate-email rationale as acceptance).
 * Any other status (declined/already cancelled) is rejected. Never touches
 * the ContributionLedger rows acceptance already posted — reversing those
 * is a separate, more invasive decision this doesn't make.
 */
async function cancelMeetingRequest(
  meetingRequest: MeetingRequestModel,
  actingUserId: string,
): Promise<MeetingRequestModel> {
  let otherPartyId: string;
  const isNegotiating =
    meetingRequest.status === MeetingRequestStatus.pending ||
    meetingRequest.status === MeetingRequestStatus.rescheduled;

  if (isNegotiating) {
    if (meetingRequest.senderId !== actingUserId) {
      throw new MeetingRequestError(403, "Only the requester can withdraw a meeting request that hasn't been accepted yet.");
    }
    otherPartyId = meetingRequest.recipientId;
  } else if (meetingRequest.status === MeetingRequestStatus.accepted) {
    if (meetingRequest.senderId !== actingUserId && meetingRequest.recipientId !== actingUserId) {
      throw new MeetingRequestError(403, "You don't have access to this meeting request.");
    }
    otherPartyId =
      meetingRequest.senderId === actingUserId ? meetingRequest.recipientId : meetingRequest.senderId;
  } else {
    throw new MeetingRequestError(409, `This meeting request can't be cancelled (it's ${meetingRequest.status}).`);
  }

  const actor = await db.user.findUnique({ where: { id: actingUserId }, select: { name: true } });
  const actorName = actor?.name ?? "A member";
  const message = isNegotiating
    ? `${actorName} withdrew their meeting request: "${meetingRequest.topic}"`
    : `${actorName} cancelled the meeting: "${meetingRequest.topic}"`;
  const link = `/inbox?item=${meetingRequest.id}`;

  // External network call — kept outside the DB transaction, same
  // best-effort philosophy as createMeetingCalendarEvent. Only reachable
  // for the `accepted` branch above — a still-negotiating request never had one.
  if (meetingRequest.googleEventId) {
    await cancelMeetingCalendarEvent(meetingRequest.googleEventId);
  }

  return db.$transaction(async (tx) => {
    const updated = await tx.meetingRequest.update({
      where: { id: meetingRequest.id },
      data: { status: MeetingRequestStatus.cancelled },
    });
    await tx.meetingRequestMessage.create({
      data: {
        meetingRequestId: meetingRequest.id,
        senderId: actingUserId,
        action: MeetingRequestMessageAction.cancelled,
      },
    });
    await createNotification(
      { recipientId: otherPartyId, type: NotificationType.meeting_request_cancelled, message, link },
      tx,
    );
    return updated;
  });
}

/**
 * Lets the sender correct/expand the topic/message of their own request
 * while it's still their own outstanding ask — `status === pending` means
 * the sender proposed last (the original request, or a later
 * counter-proposal) and the recipient hasn't responded to *that* yet. Once
 * the recipient counter-proposes (`rescheduled`), the outstanding proposal
 * on the table is theirs, not the sender's, so there's nothing of the
 * sender's left to edit — they respond via accept/decline/reschedule
 * instead. No notification/email: this is a text correction, not a new
 * lifecycle event like accept/decline/cancel, so the recipient just sees
 * the updated content whenever they next open the still-open item.
 */
async function editMeetingRequest(
  meetingRequest: MeetingRequestModel,
  actingUserId: string,
  input: { topic: string; message: string | null },
): Promise<MeetingRequestModel> {
  if (meetingRequest.senderId !== actingUserId) {
    throw new MeetingRequestError(403, "Only the requester can edit this meeting request.");
  }
  if (meetingRequest.status !== MeetingRequestStatus.pending) {
    throw new MeetingRequestError(
      409,
      meetingRequest.status === MeetingRequestStatus.rescheduled
        ? "This meeting request can't be edited while you're the one who owes a response to a proposed time."
        : `This meeting request can't be edited (it's ${meetingRequest.status}).`,
    );
  }

  return db.$transaction(async (tx) => {
    // status === pending guarantees the sender authored the latest message
    // (their own still-outstanding proposal) — that's the one being edited.
    const latestMessage = await tx.meetingRequestMessage.findFirst({
      where: { meetingRequestId: meetingRequest.id },
      orderBy: { createdAt: "desc" },
    });
    if (latestMessage && latestMessage.senderId === actingUserId) {
      await tx.meetingRequestMessage.update({
        where: { id: latestMessage.id },
        data: { body: input.message },
      });
    }
    return tx.meetingRequest.update({
      where: { id: meetingRequest.id },
      data: { topic: input.topic },
    });
  });
}

/**
 * Resolves the recipient's chosen time into one of the request's own
 * proposedTimes (defaulting to the sole entry when there's only one) — this
 * becomes the Google Calendar event's start. Rejects anything that doesn't
 * match a proposed time so the confirmed meeting can never silently drift
 * from what was actually proposed/accepted.
 */
function resolveScheduledTime(meetingRequest: MeetingRequestModel, selectedTime: string | undefined): Date {
  if (meetingRequest.proposedTimes.length === 1) return meetingRequest.proposedTimes[0];

  if (!selectedTime) {
    throw new MeetingRequestError(400, "Select which proposed time you're accepting.");
  }
  const parsed = new Date(selectedTime);
  const match = meetingRequest.proposedTimes.find((time) => time.getTime() === parsed.getTime());
  if (!match) {
    throw new MeetingRequestError(400, "Selected time isn't one of the proposed times.");
  }
  return match;
}

/**
 * Applies the current turn-holder's response to a still-negotiating
 * meeting request (§4.7): accept, decline, or propose a new time.
 * `pending`/`rescheduled` double as a turn indicator (see
 * MeetingRequestStatus's doc comment in schema.prisma) — whichever party
 * did *not* propose last is the one allowed to act, and either party can
 * keep proposing new times across unlimited rounds until one side accepts
 * or declines. `cancel` and `edit` are the exceptions — see
 * cancelMeetingRequest/editMeetingRequest — dispatched here but each with
 * its own, different permission/status rules that don't depend on turn.
 *
 * Accepting posts two ledger rows (§4.4/§11's resolved open question #12):
 * an already-`confirmed` `spent` row for the requester at the Expert
 * Consultation rate (no separate confirmation step — the system has full
 * ground truth here), and a system-generated but still `pending` `earned`
 * row for the recipient at the Knowledge discussion rate, naming the
 * requester as counterpart. These are always keyed off the meeting
 * request's fixed senderId/recipientId, never off which party happened to
 * click "Accept" — either can, once it's their turn. The recipient doesn't
 * type anything to create their entry, but it still needs the requester's
 * peer confirmation before counting toward the recipient's balance — a
 * deliberate anti-fraud check so the recipient can't unilaterally credit
 * themselves for a meeting. Both links are set in the same transaction as
 * the status flip so none of the three can diverge.
 */
export async function resolveMeetingRequest(
  meetingRequestId: string,
  actingUserId: string,
  action: ResolveAction,
): Promise<MeetingRequestModel> {
  const meetingRequest = await db.meetingRequest.findUnique({ where: { id: meetingRequestId } });
  if (!meetingRequest) throw new MeetingRequestError(404, "Meeting request not found.");

  if (action.action === "cancel") {
    return cancelMeetingRequest(meetingRequest, actingUserId);
  }
  if (action.action === "edit") {
    return editMeetingRequest(meetingRequest, actingUserId, { topic: action.topic, message: action.message });
  }

  if (
    meetingRequest.status !== MeetingRequestStatus.pending &&
    meetingRequest.status !== MeetingRequestStatus.rescheduled
  ) {
    throw new MeetingRequestError(409, `This meeting request is already ${meetingRequest.status}.`);
  }
  const turnHolderId =
    meetingRequest.status === MeetingRequestStatus.pending ? meetingRequest.recipientId : meetingRequest.senderId;
  if (actingUserId !== turnHolderId) {
    throw new MeetingRequestError(403, "It's not your turn to respond to this meeting request yet.");
  }
  const otherPartyId =
    actingUserId === meetingRequest.senderId ? meetingRequest.recipientId : meetingRequest.senderId;

  const [actor, otherParty] = await Promise.all([
    db.user.findUnique({ where: { id: actingUserId }, select: { email: true, name: true } }),
    db.user.findUnique({ where: { id: otherPartyId }, select: { email: true, name: true } }),
  ]);
  const actorName = actor?.name ?? "A member";
  const link = `/inbox?item=${meetingRequestId}`;

  if (action.action === "decline") {
    const message = `${actorName} declined your meeting request: "${meetingRequest.topic}"`;
    const updated = await db.$transaction(async (tx) => {
      const updated = await tx.meetingRequest.update({
        where: { id: meetingRequestId },
        data: { status: MeetingRequestStatus.declined },
      });
      await tx.meetingRequestMessage.create({
        data: { meetingRequestId, senderId: actingUserId, action: MeetingRequestMessageAction.declined },
      });
      await createNotification(
        { recipientId: otherPartyId, type: NotificationType.meeting_request_declined, message, link },
        tx,
      );
      return updated;
    });
    if (otherParty) {
      await sendMeetingRequestEmail(otherParty.email, otherParty.name ?? "there", {
        subject: `Meeting request declined: ${meetingRequest.topic}`,
        message,
        link: `${APP_URL}${link}`,
      });
    }
    return updated;
  }

  if (action.action === "reschedule") {
    const proposedTimes = parseProposedTimes(action.proposedTimes);
    // Flips the turn to the other party — see MeetingRequestStatus's doc
    // comment: pending = sender proposed last (recipient's turn next),
    // rescheduled = recipient proposed last (sender's turn next).
    const newStatus =
      actingUserId === meetingRequest.senderId ? MeetingRequestStatus.pending : MeetingRequestStatus.rescheduled;
    const message = `${actorName} proposed a new time for: "${meetingRequest.topic}"`;
    const updated = await db.$transaction(async (tx) => {
      const updated = await tx.meetingRequest.update({
        where: { id: meetingRequestId },
        data: { status: newStatus, proposedTimes },
      });
      await tx.meetingRequestMessage.create({
        data: {
          meetingRequestId,
          senderId: actingUserId,
          action: MeetingRequestMessageAction.proposed,
          body: action.message,
          proposedTimes,
        },
      });
      await createNotification(
        { recipientId: otherPartyId, type: NotificationType.meeting_request_rescheduled, message, link },
        tx,
      );
      return updated;
    });
    if (otherParty) {
      await sendMeetingRequestEmail(otherParty.email, otherParty.name ?? "there", {
        subject: `New time proposed: ${meetingRequest.topic}`,
        message,
        link: `${APP_URL}${link}`,
      });
    }
    return updated;
  }

  // Remaining case per the discriminated union: "accept".
  const [spendRule, earnRule, createdMessage] = await Promise.all([
    db.contributionRule.findUnique({ where: { activityKey: EXPERT_CONSULTATION_ACTIVITY_KEY } }),
    db.contributionRule.findUnique({ where: { activityKey: KNOWLEDGE_DISCUSSION_ACTIVITY_KEY } }),
    db.meetingRequestMessage.findFirst({
      where: { meetingRequestId, action: MeetingRequestMessageAction.created },
      select: { body: true },
    }),
  ]);
  if (!spendRule || !spendRule.active || spendRule.type !== LedgerTransactionType.spent) {
    throw new MeetingRequestError(409, "Expert Consultation rate isn't configured.");
  }
  if (!earnRule || !earnRule.active || earnRule.type !== LedgerTransactionType.earned) {
    throw new MeetingRequestError(409, "Knowledge discussion rate isn't configured.");
  }

  const acceptedMessage = `${actorName} accepted your meeting request: "${meetingRequest.topic}"`;
  const scheduledAt = resolveScheduledTime(meetingRequest, action.selectedTime);

  // Fixed identities, independent of who happened to click "Accept" — the
  // calendar invite must always go to the sender and recipient by role,
  // not "requester + actor" (actor may now be either one).
  const senderUser = actingUserId === meetingRequest.senderId ? actor : otherParty;
  const recipientUser = actingUserId === meetingRequest.recipientId ? actor : otherParty;

  // External network call — kept outside the DB transaction below, and
  // best-effort (see google-calendar.ts): a failed/unconfigured Google call
  // must never block acceptance, since the ledger rows are the source of
  // truth for the meeting having happened.
  const { meetingUrl, googleEventId } =
    senderUser && recipientUser
      ? await createMeetingCalendarEvent({
          topic: meetingRequest.topic,
          startsAt: scheduledAt,
          attendees: [
            { email: senderUser.email, name: senderUser.name ?? "there" },
            { email: recipientUser.email, name: recipientUser.name ?? "there" },
          ],
          description: createdMessage?.body ?? undefined,
        })
      : { meetingUrl: null, googleEventId: null };

  const updated = await db.$transaction(async (tx) => {
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

    const updated = await tx.meetingRequest.update({
      where: { id: meetingRequestId },
      data: {
        status: MeetingRequestStatus.accepted,
        contributionLedgerId: spendLedgerEntry.id,
        recipientContributionLedgerId: earnLedgerEntry.id,
        scheduledAt,
        meetingUrl,
        googleEventId,
      },
    });

    await tx.meetingRequestMessage.create({
      data: { meetingRequestId, senderId: actingUserId, action: MeetingRequestMessageAction.accepted },
    });

    await createNotification(
      {
        recipientId: otherPartyId,
        type: NotificationType.meeting_request_accepted,
        message: acceptedMessage,
        link,
      },
      tx,
    );

    return updated;
  });

  // No NASIHA email here (unlike decline/reschedule below) — Google's own
  // calendar invite (sendUpdates: "all" above) already reaches both the
  // requester and the recipient with the time and Meet link, so a second
  // email would just be a duplicate. The in-app Notification created above
  // still covers the acceptance for anyone not checking that inbox.

  return updated;
}

/**
 * Accepted meeting requests due in the future, for the calendar page's
 * "Upcoming List" (kept separate from the shared, unfiltered Event model —
 * see plan doc — since these are private to the two participants).
 */
export async function getUpcomingMeetingsForUser(userId: string) {
  const meetings = await db.meetingRequest.findMany({
    where: {
      status: MeetingRequestStatus.accepted,
      scheduledAt: { gte: new Date() },
      OR: [{ senderId: userId }, { recipientId: userId }],
    },
    select: {
      id: true,
      topic: true,
      scheduledAt: true,
      meetingUrl: true,
      senderId: true,
      recipientId: true,
      sender: { select: { name: true } },
      recipient: { select: { name: true } },
    },
    orderBy: { scheduledAt: "asc" },
  });

  return meetings.map((meeting) => ({
    id: meeting.id,
    topic: meeting.topic,
    scheduledAt: (meeting.scheduledAt as Date).toISOString(),
    meetingUrl: meeting.meetingUrl,
    otherPartyName:
      (meeting.senderId === userId ? meeting.recipient.name : meeting.sender.name) ?? "NASIHA Member",
  }));
}
