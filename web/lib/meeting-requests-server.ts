import "server-only";
import { db } from "@/lib/db";
import {
  ContributionSource,
  LedgerStatus,
  LedgerTransactionType,
  MeetingPlatform,
  MeetingRequestMessageAction,
  MeetingRequestStatus,
  NotificationType,
} from "@/lib/generated/prisma/enums";
import type { MeetingRequestModel } from "@/lib/generated/prisma/models/MeetingRequest";
import { sendMeetingRequestEmail } from "@/lib/email";
import {
  cancelMeetingCalendarEvent,
  createLiveKitMeetingCalendarEvent,
  createMeetingCalendarEvent,
  deleteMeetingRecording,
  updateMeetingCalendarEventTime,
} from "@/lib/google-calendar";
import { createLiveKitRoom } from "@/lib/livekit";
import { INBOX_TIERS } from "@/lib/members";
import { createNotification } from "@/lib/notifications-server";
import {
  deleteMeetingMessageImage,
  getMeetingMessageImageUrl,
  uploadMeetingMessageImage,
  UploadValidationError,
} from "@/lib/storage";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";

/** The rate-card key that prices an accepted meeting request's spend side (§4.4, seeded in prisma/seed.ts). */
const EXPERT_CONSULTATION_ACTIVITY_KEY = "expert_consultation";
/** The rate-card key for the recipient's system-generated earn side (§11's resolved open question #12). */
const KNOWLEDGE_DISCUSSION_ACTIVITY_KEY = "knowledge_discussion";

export class MeetingRequestError extends Error {
  constructor(
    public readonly status: 400 | 403 | 404 | 409 | 502,
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
  input: {
    recipientId: string;
    topic: string;
    proposedTimes: string[];
    message: string | null;
    meetingPlatform: MeetingPlatform;
  },
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
        meetingPlatform: input.meetingPlatform,
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
  | { action: "edit"; topic: string; proposedTimes: string[]; message: string | null }
  | { action: "message"; body: string };

/**
 * Cancels a meeting request (§4.7 follow-up), in either of two states with
 * different permission rules:
 *  - `pending`/`rescheduled`: only the original sender may withdraw the
 *    whole negotiation, regardless of whose turn it currently is to
 *    respond — whichever party currently holds the turn already has
 *    "decline" for this case, so letting them also "cancel" would just be
 *    a confusing second path to the same thing. No Google event exists yet
 *    at this stage.
 *  - `accepted`/`reschedule_by_sender`/`reschedule_by_recipient`: either
 *    party may cancel — deletes the Google Calendar event (Google's own
 *    cancellation email covers both attendees, same no-duplicate-email
 *    rationale as acceptance). A meeting mid-reschedule-negotiation is
 *    still fundamentally an accepted meeting (still has a scheduledAt/
 *    googleEventId), just with an outstanding proposal on top of it.
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
  const isAcceptedOrRenegotiating =
    meetingRequest.status === MeetingRequestStatus.accepted ||
    meetingRequest.status === MeetingRequestStatus.reschedule_by_sender ||
    meetingRequest.status === MeetingRequestStatus.reschedule_by_recipient;

  if (isNegotiating) {
    if (meetingRequest.senderId !== actingUserId) {
      throw new MeetingRequestError(403, "Only the requester can withdraw a meeting request that hasn't been accepted yet.");
    }
    otherPartyId = meetingRequest.recipientId;
  } else if (isAcceptedOrRenegotiating) {
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
 * Freeform follow-up comment on a meeting-request thread (§4.7 follow-up
 * conversation) — either party may post one at any status/turn, unlike the
 * turn-gated negotiation actions. Never touches MeetingRequest.status.
 */
async function postMeetingRequestComment(
  meetingRequest: MeetingRequestModel,
  actingUserId: string,
  body: string,
): Promise<MeetingRequestModel> {
  if (meetingRequest.senderId !== actingUserId && meetingRequest.recipientId !== actingUserId) {
    throw new MeetingRequestError(403, "You don't have access to this meeting request.");
  }
  const otherPartyId =
    actingUserId === meetingRequest.senderId ? meetingRequest.recipientId : meetingRequest.senderId;

  const [actor, otherParty] = await Promise.all([
    db.user.findUnique({ where: { id: actingUserId }, select: { name: true } }),
    db.user.findUnique({ where: { id: otherPartyId }, select: { email: true, name: true } }),
  ]);
  const actorName = actor?.name ?? "A member";
  const message = `${actorName} sent a message about: "${meetingRequest.topic}"`;
  const link = `/inbox?item=${meetingRequest.id}`;

  await db.$transaction(async (tx) => {
    await tx.meetingRequestMessage.create({
      data: { meetingRequestId: meetingRequest.id, senderId: actingUserId, action: MeetingRequestMessageAction.commented, body },
    });
    await createNotification(
      { recipientId: otherPartyId, type: NotificationType.meeting_request_message, message, link },
      tx,
    );
  });
  if (otherParty) {
    await sendMeetingRequestEmail(otherParty.email, otherParty.name ?? "there", {
      subject: `New message: ${meetingRequest.topic}`,
      message: `${message}\n\n"${body}"`,
      link: `${APP_URL}${link}`,
    });
  }

  return meetingRequest;
}

/**
 * Lets the sender correct/expand the topic/message/proposed times of their
 * own request while it's still their own outstanding ask — `status ===
 * pending` means the sender proposed last (the original request, or a later
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
  input: { topic: string; proposedTimes: string[]; message: string | null },
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

  const proposedTimes = parseProposedTimes(input.proposedTimes);

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
        data: { body: input.message, proposedTimes },
      });
    }
    return tx.meetingRequest.update({
      where: { id: meetingRequest.id },
      data: { topic: input.topic, proposedTimes },
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
 * Proposes a new time — used both for the pre-acceptance negotiation
 * (§4.7) and, once a meeting has been `accepted`, for reopening it into a
 * `reschedule_by_sender`/`reschedule_by_recipient` follow-up negotiation on
 * top of the still-standing scheduledAt/meetingUrl/googleEventId (§4.7
 * follow-up — see MeetingRequestStatus's doc comment in schema.prisma).
 * Entry into that follow-up pair isn't turn-gated — either party may kick
 * one off at any time, since there's no outstanding proposal yet to hold a
 * turn on. Once inside any of the two negotiation pairs, only the current
 * turn-holder may propose again, same turn rule for both pairs.
 */
async function handleReschedulePropose(
  meetingRequest: MeetingRequestModel,
  actingUserId: string,
  proposedTimesInput: string[],
  messageInput: string | null,
): Promise<MeetingRequestModel> {
  if (meetingRequest.senderId !== actingUserId && meetingRequest.recipientId !== actingUserId) {
    throw new MeetingRequestError(403, "You don't have access to this meeting request.");
  }

  let newStatus: MeetingRequestStatus;
  if (meetingRequest.status === MeetingRequestStatus.accepted) {
    newStatus =
      actingUserId === meetingRequest.senderId
        ? MeetingRequestStatus.reschedule_by_sender
        : MeetingRequestStatus.reschedule_by_recipient;
  } else if (
    meetingRequest.status === MeetingRequestStatus.pending ||
    meetingRequest.status === MeetingRequestStatus.rescheduled
  ) {
    const turnHolderId =
      meetingRequest.status === MeetingRequestStatus.pending ? meetingRequest.recipientId : meetingRequest.senderId;
    if (actingUserId !== turnHolderId) {
      throw new MeetingRequestError(403, "It's not your turn to respond to this meeting request yet.");
    }
    newStatus =
      actingUserId === meetingRequest.senderId ? MeetingRequestStatus.pending : MeetingRequestStatus.rescheduled;
  } else if (
    meetingRequest.status === MeetingRequestStatus.reschedule_by_sender ||
    meetingRequest.status === MeetingRequestStatus.reschedule_by_recipient
  ) {
    const turnHolderId =
      meetingRequest.status === MeetingRequestStatus.reschedule_by_sender
        ? meetingRequest.recipientId
        : meetingRequest.senderId;
    if (actingUserId !== turnHolderId) {
      throw new MeetingRequestError(403, "It's not your turn to respond to the proposed new time yet.");
    }
    newStatus =
      actingUserId === meetingRequest.senderId
        ? MeetingRequestStatus.reschedule_by_sender
        : MeetingRequestStatus.reschedule_by_recipient;
  } else {
    throw new MeetingRequestError(409, `This meeting request is already ${meetingRequest.status}.`);
  }

  const proposedTimes = parseProposedTimes(proposedTimesInput);
  const otherPartyId =
    actingUserId === meetingRequest.senderId ? meetingRequest.recipientId : meetingRequest.senderId;
  const actor = await db.user.findUnique({ where: { id: actingUserId }, select: { name: true } });
  const actorName = actor?.name ?? "A member";
  const message = `${actorName} proposed a new time for: "${meetingRequest.topic}"`;
  const link = `/inbox?item=${meetingRequest.id}`;

  const updated = await db.$transaction(async (tx) => {
    const updated = await tx.meetingRequest.update({
      where: { id: meetingRequest.id },
      data: { status: newStatus, proposedTimes },
    });
    await tx.meetingRequestMessage.create({
      data: {
        meetingRequestId: meetingRequest.id,
        senderId: actingUserId,
        action: MeetingRequestMessageAction.proposed,
        body: messageInput,
        proposedTimes,
      },
    });
    await createNotification(
      { recipientId: otherPartyId, type: NotificationType.meeting_request_rescheduled, message, link },
      tx,
    );
    return updated;
  });

  const otherParty = await db.user.findUnique({ where: { id: otherPartyId }, select: { email: true, name: true } });
  if (otherParty) {
    await sendMeetingRequestEmail(otherParty.email, otherParty.name ?? "there", {
      subject: `New time proposed: ${meetingRequest.topic}`,
      message,
      link: `${APP_URL}${link}`,
    });
  }

  return updated;
}

/**
 * Confirms a proposed new time for an already-accepted meeting (the
 * `reschedule_by_sender`/`reschedule_by_recipient` follow-up flow) —
 * patches the *existing* Google Calendar event's time in place (same
 * event, same Meet link — see updateMeetingCalendarEventTime) rather than
 * creating a new one, and updates scheduledAt to match. Never touches the
 * ContributionLedger rows the original acceptance already posted — a
 * reschedule is the same engagement at a different time, not a new one, so
 * no new spend/earn entries are created here.
 */
async function confirmMeetingReschedule(
  meetingRequest: MeetingRequestModel,
  actingUserId: string,
  selectedTime: string | undefined,
  otherPartyId: string,
  actorName: string,
  link: string,
): Promise<MeetingRequestModel> {
  const scheduledAt = resolveScheduledTime(meetingRequest, selectedTime);

  // Best-effort, same non-fatal philosophy as createMeetingCalendarEvent —
  // a failed/unconfigured Google call must never block confirming the new
  // time, since MeetingRequest.scheduledAt is the source of truth.
  if (meetingRequest.googleEventId) {
    await updateMeetingCalendarEventTime(meetingRequest.googleEventId, scheduledAt, null);
  }

  const message = `${actorName} confirmed the new time for: "${meetingRequest.topic}"`;

  return db.$transaction(async (tx) => {
    const updated = await tx.meetingRequest.update({
      where: { id: meetingRequest.id },
      data: { status: MeetingRequestStatus.accepted, scheduledAt },
    });
    await tx.meetingRequestMessage.create({
      data: { meetingRequestId: meetingRequest.id, senderId: actingUserId, action: MeetingRequestMessageAction.accepted },
    });
    await createNotification(
      { recipientId: otherPartyId, type: NotificationType.meeting_request_accepted, message, link },
      tx,
    );
    return updated;
  });
  // No NASIHA email here — same rationale as the original acceptance below:
  // Google's own calendar.patch (sendUpdates: "all") already emails both
  // attendees the updated invite.
}

/**
 * Applies the current turn-holder's response to a still-negotiating
 * meeting request (§4.7): accept, decline, or (dispatched separately, see
 * handleReschedulePropose) propose a new time. `pending`/`rescheduled` and
 * `reschedule_by_sender`/`reschedule_by_recipient` each double as a turn
 * indicator (see MeetingRequestStatus's doc comment in schema.prisma) —
 * whichever party did *not* propose last is the one allowed to act,
 * across unlimited rounds until one side accepts or declines. `cancel`
 * and `edit` are further exceptions — see cancelMeetingRequest/
 * editMeetingRequest — dispatched here but each with its own, different
 * permission/status rules that don't depend on turn.
 *
 * Accepting the *original* pre-acceptance ask posts two ledger rows
 * (§4.4/§11's resolved open question #12): an already-`confirmed` `spent`
 * row for the requester at the Expert Consultation rate (no separate
 * confirmation step — the system has full ground truth here), and a
 * system-generated but still `pending` `earned` row for the recipient at
 * the Knowledge discussion rate, naming the requester as counterpart.
 * These are always keyed off the meeting request's fixed senderId/
 * recipientId, never off which party happened to click "Accept" — either
 * can, once it's their turn. The recipient doesn't type anything to create
 * their entry, but it still needs the requester's peer confirmation before
 * counting toward the recipient's balance — a deliberate anti-fraud check
 * so the recipient can't unilaterally credit themselves for a meeting.
 * Both links are set in the same transaction as the status flip so none of
 * the three can diverge. Accepting a *reschedule* of an already-accepted
 * meeting is a different, ledger-free path — see confirmMeetingReschedule.
 */
export async function resolveMeetingRequest(
  meetingRequestId: string,
  actingUserId: string,
  action: ResolveAction,
): Promise<MeetingRequestModel> {
  const meetingRequest = await db.meetingRequest.findUnique({ where: { id: meetingRequestId } });
  if (!meetingRequest) throw new MeetingRequestError(404, "Meeting request not found.");

  if (action.action === "message") {
    return postMeetingRequestComment(meetingRequest, actingUserId, action.body);
  }
  if (action.action === "cancel") {
    return cancelMeetingRequest(meetingRequest, actingUserId);
  }
  if (action.action === "edit") {
    return editMeetingRequest(meetingRequest, actingUserId, {
      topic: action.topic,
      proposedTimes: action.proposedTimes,
      message: action.message,
    });
  }
  if (action.action === "reschedule") {
    return handleReschedulePropose(meetingRequest, actingUserId, action.proposedTimes, action.message);
  }

  // Remaining actions ("accept"/"decline") respond to whichever negotiation
  // is currently open: the original pre-acceptance ask, or a reschedule
  // proposed on top of an already-accepted meeting.
  const isRenegotiatingAccepted =
    meetingRequest.status === MeetingRequestStatus.reschedule_by_sender ||
    meetingRequest.status === MeetingRequestStatus.reschedule_by_recipient;

  if (
    meetingRequest.status !== MeetingRequestStatus.pending &&
    meetingRequest.status !== MeetingRequestStatus.rescheduled &&
    !isRenegotiatingAccepted
  ) {
    throw new MeetingRequestError(409, `This meeting request is already ${meetingRequest.status}.`);
  }
  const turnHolderId = isRenegotiatingAccepted
    ? meetingRequest.status === MeetingRequestStatus.reschedule_by_sender
      ? meetingRequest.recipientId
      : meetingRequest.senderId
    : meetingRequest.status === MeetingRequestStatus.pending
      ? meetingRequest.recipientId
      : meetingRequest.senderId;
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
    if (isRenegotiatingAccepted) {
      const message = `${actorName} declined the new time for: "${meetingRequest.topic}" — it stays at its original time.`;
      const updated = await db.$transaction(async (tx) => {
        const updated = await tx.meetingRequest.update({
          where: { id: meetingRequestId },
          data: { status: MeetingRequestStatus.accepted },
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
          subject: `New time declined: ${meetingRequest.topic}`,
          message,
          link: `${APP_URL}${link}`,
        });
      }
      return updated;
    }

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

  // Remaining case per the discriminated union: "accept".
  if (isRenegotiatingAccepted) {
    return confirmMeetingReschedule(meetingRequest, actingUserId, action.selectedTime, otherPartyId, actorName, link);
  }

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
  // best-effort (see google-calendar.ts): a failed/unconfigured Google/
  // LiveKit call must never block acceptance, since the ledger rows are the
  // source of truth for the meeting having happened. Platform was chosen by
  // the sender at request-creation time (createMeetingRequest), not here —
  // the id already exists by this point, unlike Event's createEvent flow,
  // so no pre-generated id is needed for the LiveKit meeting-page link.
  let meetingUrl: string | null = null;
  let googleEventId: string | null = null;
  let livekitRoomName: string | null = null;
  if (senderUser && recipientUser && meetingRequest.meetingPlatform === MeetingPlatform.livekit) {
    livekitRoomName = await createLiveKitRoom(meetingRequest.id, meetingRequest.topic);
    const created = await createLiveKitMeetingCalendarEvent({
      topic: meetingRequest.topic,
      startsAt: scheduledAt,
      attendees: [
        { email: senderUser.email, name: senderUser.name ?? "there" },
        { email: recipientUser.email, name: recipientUser.name ?? "there" },
      ],
      description: createdMessage?.body ?? undefined,
      meetingPageUrl: `${APP_URL}/meet/request/${meetingRequest.id}`,
    });
    googleEventId = created.googleEventId;
  } else if (senderUser && recipientUser) {
    const created = await createMeetingCalendarEvent({
      topic: meetingRequest.topic,
      startsAt: scheduledAt,
      attendees: [
        { email: senderUser.email, name: senderUser.name ?? "there" },
        { email: recipientUser.email, name: recipientUser.name ?? "there" },
      ],
      description: createdMessage?.body ?? undefined,
    });
    meetingUrl = created.meetingUrl;
    googleEventId = created.googleEventId;
  }

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
        livekitRoomName,
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

    // Sender is the earn side's named counterpart (line ~675 above) — they
    // need their own ping distinct from acceptedMessage, since that one
    // goes to whichever party didn't click Accept and says nothing about
    // confirming Hours.
    await createNotification(
      {
        recipientId: meetingRequest.senderId,
        type: NotificationType.contribution_confirmation_requested,
        message: `${recipientUser?.name ?? "A member"} logged ${earnRule.hours.toNumber()} Knowledge Hours for your meeting: "${meetingRequest.topic}" — please confirm.`,
        link: "/contributions",
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
 * Every meeting request (any status) a user sent or received, newest-first,
 * for the "All My Posts" Meetings tab — unlike getUpcomingMeetingsForUser,
 * this isn't limited to accepted/future ones, since the tab is meant to
 * reflect the full history of a member's activity, not just what's on their
 * calendar.
 */
export async function getMyMeetingRequests(userId: string) {
  const meetings = await db.meetingRequest.findMany({
    where: { OR: [{ senderId: userId }, { recipientId: userId }] },
    select: {
      id: true,
      topic: true,
      status: true,
      scheduledAt: true,
      createdAt: true,
      senderId: true,
      recipientId: true,
      sender: { select: { name: true } },
      recipient: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return meetings.map((meeting) => ({
    id: meeting.id,
    topic: meeting.topic,
    status: meeting.status,
    scheduledAt: meeting.scheduledAt ? (meeting.scheduledAt as Date).toISOString() : null,
    createdAt: (meeting.createdAt as Date).toISOString(),
    otherPartyName:
      (meeting.senderId === userId ? meeting.recipient.name : meeting.sender.name) ?? "NASIHA Member",
  }));
}

/**
 * Meeting requests due today or later, for the calendar page's "Upcoming
 * List" (kept separate from the shared, unfiltered Event model — see plan
 * doc — since these are private to the two participants). Covers two shapes:
 *  - `accepted`/`reschedule_by_sender`/`reschedule_by_recipient`: a
 *    confirmed `scheduledAt`. A meeting mid-reschedule-negotiation is still
 *    on the books at its current scheduledAt until that proposal resolves,
 *    so it shouldn't vanish from the calendar mid-negotiation.
 *  - `pending`/`rescheduled`: not yet accepted, so there's no `scheduledAt`
 *    yet — only `proposedTimes` on the table. These still show up (marked
 *    `isPending`) using the earliest proposed time from today onward, so a
 *    meeting doesn't disappear from the calendar just because the other
 *    party hasn't responded yet.
 */
export async function getUpcomingMeetingsForUser(userId: string) {
  // Start-of-day cutoff, not `now` — a today meeting shouldn't drop off the
  // dashboard/calendar the moment its scheduled time passes.
  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);

  const [confirmed, negotiating] = await Promise.all([
    db.meetingRequest.findMany({
      where: {
        status: {
          in: [
            MeetingRequestStatus.accepted,
            MeetingRequestStatus.reschedule_by_sender,
            MeetingRequestStatus.reschedule_by_recipient,
          ],
        },
        scheduledAt: { gte: startOfToday },
        OR: [{ senderId: userId }, { recipientId: userId }],
      },
      select: {
        id: true,
        topic: true,
        scheduledAt: true,
        meetingUrl: true,
        livekitRoomName: true,
        senderId: true,
        recipientId: true,
        sender: { select: { name: true } },
        recipient: { select: { name: true } },
      },
    }),
    db.meetingRequest.findMany({
      where: {
        status: { in: [MeetingRequestStatus.pending, MeetingRequestStatus.rescheduled] },
        OR: [{ senderId: userId }, { recipientId: userId }],
      },
      select: {
        id: true,
        topic: true,
        proposedTimes: true,
        senderId: true,
        recipientId: true,
        sender: { select: { name: true } },
        recipient: { select: { name: true } },
      },
    }),
  ]);

  const confirmedMeetings = confirmed.map((meeting) => ({
    id: meeting.id,
    topic: meeting.topic,
    scheduledAt: (meeting.scheduledAt as Date).toISOString(),
    meetingUrl: meeting.meetingUrl,
    livekitRoomName: meeting.livekitRoomName,
    isPending: false,
    isOrganizer: meeting.senderId === userId,
    otherPartyName:
      (meeting.senderId === userId ? meeting.recipient.name : meeting.sender.name) ?? "NASIHA Member",
  }));

  const pendingMeetings = negotiating.flatMap((meeting) => {
    const nextProposedTime = meeting.proposedTimes
      .filter((time) => time >= startOfToday)
      .sort((a, b) => a.getTime() - b.getTime())[0];
    if (!nextProposedTime) return [];
    return [
      {
        id: meeting.id,
        topic: meeting.topic,
        scheduledAt: nextProposedTime.toISOString(),
        meetingUrl: null,
        livekitRoomName: null,
        isPending: true,
        isOrganizer: meeting.senderId === userId,
        otherPartyName:
          (meeting.senderId === userId ? meeting.recipient.name : meeting.sender.name) ?? "NASIHA Member",
      },
    ];
  });

  return [...confirmedMeetings, ...pendingMeetings].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}

// ===== In-app meeting waiting room (meeting-join-experience) =====

const ACCEPTED_STATUSES: MeetingRequestStatus[] = [
  MeetingRequestStatus.accepted,
  MeetingRequestStatus.reschedule_by_sender,
  MeetingRequestStatus.reschedule_by_recipient,
];

/**
 * Powers both the server-rendered /meet/request/[id] page and its ~5s
 * client poll. Sender-or-recipient only (both parties may join), always
 * Clerk-authenticated — a MeetingRequest is a private 1:1, unlike a
 * community Event, so there's no unauthenticated/`open` case here.
 * Organizer = sender, matching every other sender-privileged action on
 * this model (accept/decline/cancel turn logic above).
 */
export async function getMeetingRequestMeetingStatus(
  meetingRequestId: string,
  userId: string,
): Promise<{
  title: string;
  organizerName: string;
  started: boolean;
  startsAt: string;
  meetingUrl: string | null;
  /** Unlike meetingUrl, exposed regardless of `started` — see Event's getEventMeetingStatus for the same field/rationale. */
  livekitRoomName: string | null;
  organizerMessage: string | null;
  organizerMessageImageUrl: string | null;
  isOrganizer: boolean;
  configured: boolean;
  /** Always false — a MeetingRequest is a private 2-party 1:1, never reachable by an unvetted anonymous visitor, unlike an `open` Event. */
  requiresCodeOfConductAgreement: boolean;
}> {
  const meetingRequest = await db.meetingRequest.findUnique({
    where: { id: meetingRequestId },
    select: {
      topic: true,
      senderId: true,
      sender: { select: { name: true } },
      recipientId: true,
      status: true,
      scheduledAt: true,
      meetingUrl: true,
      livekitRoomName: true,
      meetingStartedAt: true,
      meetingOrganizerMessage: true,
      meetingOrganizerMessageImageKey: true,
    },
  });
  if (!meetingRequest) throw new MeetingRequestError(404, "Meeting request not found.");
  if (meetingRequest.senderId !== userId && meetingRequest.recipientId !== userId) {
    throw new MeetingRequestError(403, "You're not part of this meeting.");
  }
  if (!ACCEPTED_STATUSES.includes(meetingRequest.status) || !meetingRequest.scheduledAt) {
    throw new MeetingRequestError(404, "This meeting hasn't been scheduled.");
  }

  return {
    title: meetingRequest.topic,
    organizerName: meetingRequest.sender.name ?? "NASIHA Member",
    started: meetingRequest.meetingStartedAt !== null,
    startsAt: meetingRequest.scheduledAt.toISOString(),
    meetingUrl: meetingRequest.meetingStartedAt ? meetingRequest.meetingUrl : null,
    livekitRoomName: meetingRequest.livekitRoomName,
    organizerMessage: meetingRequest.meetingOrganizerMessage,
    organizerMessageImageUrl: getMeetingMessageImageUrl(meetingRequest.meetingOrganizerMessageImageKey),
    isOrganizer: meetingRequest.senderId === userId,
    configured: meetingRequest.meetingUrl !== null || meetingRequest.livekitRoomName !== null,
    requiresCodeOfConductAgreement: false,
  };
}

/**
 * MeetingRequest counterpart to attachLiveKitEventRecordingSegment
 * (lib/events-server.ts) — see its doc comment for the shared rationale.
 * No occurrence resolution needed here: a MeetingRequest is always a
 * one-off meeting, same reasoning MeetingRequest.recordingUrl's own
 * schema comment already gives.
 */
export async function attachLiveKitMeetingRequestRecordingSegment(
  roomName: string,
  segment: { egressId: string; objectKey: string; startedAt: Date },
): Promise<boolean> {
  const meetingRequest = await db.meetingRequest.findFirst({
    where: { livekitRoomName: roomName },
    select: { id: true },
  });
  if (!meetingRequest) return false;

  await db.meetingRequestRecording.upsert({
    where: { egressId: segment.egressId },
    create: { meetingRequestId: meetingRequest.id, ...segment },
    update: {},
  });
  return true;
}

/**
 * MeetingRequest counterpart to getEventRecordingObjectKey
 * (lib/events-server.ts) — see its doc comment for the shared rationale.
 * Access is simpler here: a MeetingRequest is always a private 2-party
 * 1:1, so "sender or recipient" is the whole gate (mirrors
 * getMeetingRequestMeetingStatus's own check).
 */
export async function getMeetingRequestRecordingObjectKey(
  meetingRequestId: string,
  recordingId: string,
  userId: string,
): Promise<string> {
  const meetingRequest = await db.meetingRequest.findUnique({
    where: { id: meetingRequestId },
    select: { senderId: true, recipientId: true },
  });
  if (!meetingRequest) throw new MeetingRequestError(404, "Meeting request not found.");
  if (meetingRequest.senderId !== userId && meetingRequest.recipientId !== userId) {
    throw new MeetingRequestError(403, "You're not part of this meeting.");
  }

  const recording = await db.meetingRequestRecording.findFirst({
    where: { id: recordingId, meetingRequestId },
    select: { objectKey: true },
  });
  if (!recording) throw new MeetingRequestError(404, "Recording not found.");
  return recording.objectKey;
}

/** Sender-only: sets/edits the optional waiting-room message + image shown to the recipient before Start. */
export async function updateMeetingRequestMeetingMessage(
  meetingRequestId: string,
  actingUserId: string,
  input: { message: string | null; image: File | null; removeImage: boolean },
): Promise<void> {
  const meetingRequest = await db.meetingRequest.findUnique({
    where: { id: meetingRequestId },
    select: { senderId: true, meetingOrganizerMessageImageKey: true },
  });
  if (!meetingRequest) throw new MeetingRequestError(404, "Meeting request not found.");
  if (meetingRequest.senderId !== actingUserId) {
    throw new MeetingRequestError(403, "Only the meeting organizer can edit this message.");
  }

  let imageKey = meetingRequest.meetingOrganizerMessageImageKey;
  if (input.image) {
    try {
      imageKey = await uploadMeetingMessageImage(input.image);
    } catch (error) {
      if (error instanceof UploadValidationError) throw new MeetingRequestError(400, error.message);
      throw error;
    }
  } else if (input.removeImage) {
    imageKey = null;
  }

  await db.meetingRequest.update({
    where: { id: meetingRequestId },
    data: { meetingOrganizerMessage: input.message, meetingOrganizerMessageImageKey: imageKey },
  });

  if (imageKey !== meetingRequest.meetingOrganizerMessageImageKey && meetingRequest.meetingOrganizerMessageImageKey) {
    await deleteMeetingMessageImage(meetingRequest.meetingOrganizerMessageImageKey);
  }
}

/** Sender-only: marks the meeting live, triggering the waiting recipient's auto-redirect on their next poll. No-op if there's no meeting link/room configured (neither Meet nor LiveKit). */
export async function startMeetingRequestMeeting(meetingRequestId: string, actingUserId: string): Promise<void> {
  const meetingRequest = await db.meetingRequest.findUnique({
    where: { id: meetingRequestId },
    select: { senderId: true, meetingUrl: true, livekitRoomName: true },
  });
  if (!meetingRequest) throw new MeetingRequestError(404, "Meeting request not found.");
  if (meetingRequest.senderId !== actingUserId) {
    throw new MeetingRequestError(403, "Only the meeting organizer can start the meeting.");
  }
  // Bug fixed 2026-08-24: this only checked meetingUrl, so clicking "Start
  // Meeting" silently no-op'd for every LiveKit-backed meeting request —
  // meetingUrl is always null there, livekitRoomName is used instead.
  if (!meetingRequest.meetingUrl && !meetingRequest.livekitRoomName) return;

  await db.meetingRequest.update({
    where: { id: meetingRequestId },
    data: { meetingStartedAt: new Date(), meetingEndedAt: null },
  });
}

/** Sender-only: un-starts the meeting — same rationale as resetEventMeeting in events-server.ts. */
export async function resetMeetingRequestMeeting(meetingRequestId: string, actingUserId: string): Promise<void> {
  const meetingRequest = await db.meetingRequest.findUnique({
    where: { id: meetingRequestId },
    select: { senderId: true },
  });
  if (!meetingRequest) throw new MeetingRequestError(404, "Meeting request not found.");
  if (meetingRequest.senderId !== actingUserId) {
    throw new MeetingRequestError(403, "Only the meeting organizer can reset the meeting.");
  }

  await db.meetingRequest.update({ where: { id: meetingRequestId }, data: { meetingStartedAt: null } });
}

/**
 * Deletes the meeting's recording (sender/organizer-only, same convention as
 * start/resetMeetingRequestMeeting above). Removes the actual Drive file via
 * the dedicated account first, and only clears recordingUrl/driveFileId once
 * that succeeds — a failed Drive delete must not leave an orphaned file with
 * no DB record pointing back to it.
 */
export async function deleteMeetingRequestRecording(meetingRequestId: string, actingUserId: string): Promise<void> {
  const meetingRequest = await db.meetingRequest.findUnique({
    where: { id: meetingRequestId },
    select: { senderId: true, recordingUrl: true, driveFileId: true },
  });
  if (!meetingRequest) throw new MeetingRequestError(404, "Meeting request not found.");
  if (meetingRequest.senderId !== actingUserId) {
    throw new MeetingRequestError(403, "Only the meeting organizer can delete its recording.");
  }
  if (!meetingRequest.recordingUrl || !meetingRequest.driveFileId) {
    throw new MeetingRequestError(404, "Recording not found.");
  }

  const deleted = await deleteMeetingRecording(meetingRequest.driveFileId);
  if (!deleted) {
    throw new MeetingRequestError(502, "Couldn't delete the recording — please try again.");
  }

  await db.meetingRequest.update({
    where: { id: meetingRequestId },
    data: { recordingUrl: null, driveFileId: null },
  });
}
