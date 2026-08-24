import { z } from "zod";

/**
 * POST /api/inbox/meeting-requests body shape — "Request Meeting" on a
 * Directory card (§4.7). `proposedTimes` are datetime-local input values
 * (no offset); the server parses each into a Date and rejects anything that
 * doesn't resolve to a real instant.
 */
export const createMeetingRequestSchema = z.object({
  recipientId: z.string().trim().min(1, "Select a recipient"),
  topic: z.string().trim().min(1, "Describe what you'd like to discuss").max(200),
  proposedTimes: z
    .array(z.string().trim().min(1))
    .min(1, "Propose at least one time")
    .max(5, "Propose at most 5 times"),
  message: z.string().trim().max(1000).nullable(),
  // Defaults to google_meet, matching the DB column's default and today's
  // only behavior — see MeetingRequest.meetingPlatform's schema comment.
  meetingPlatform: z.enum(["google_meet", "livekit"]).default("google_meet"),
});

export type CreateMeetingRequestValues = z.infer<typeof createMeetingRequestSchema>;

/**
 * PATCH /api/inbox/meeting-requests/:id body shape. `accept`/`decline`/
 * `reschedule` are the recipient's response to a `pending` request (§4.7):
 * `reschedule` carries the counter-proposed times; `accept` carries
 * `selectedTime` only when the request has more than one proposedTimes
 * entry (the server defaults to the sole entry otherwise) — this becomes
 * the confirmed Google Calendar event's start time. `decline` has no
 * further input. `cancel` is different in kind: either party (not just the
 * recipient) may cancel an already-`accepted` request, which deletes the
 * Google Calendar event. `edit` is the sender correcting/expanding their
 * own request's topic/message/proposed times while it's still open (pending
 * or rescheduled) — not available once accepted/declined/cancelled. `message`
 * is a freeform follow-up comment on the thread — unlike the actions above,
 * it's available to either party at any status/turn and never changes
 * MeetingRequest.status (§4.7 follow-up conversation).
 */
export const meetingRequestActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("accept"), selectedTime: z.string().trim().min(1).optional() }),
  z.object({ action: z.literal("decline") }),
  z.object({ action: z.literal("message"), body: z.string().trim().min(1, "Write a message").max(2000) }),
  z.object({
    action: z.literal("reschedule"),
    proposedTimes: z
      .array(z.string().trim().min(1))
      .min(1, "Propose at least one time")
      .max(5, "Propose at most 5 times"),
    message: z.string().trim().max(1000).nullable(),
  }),
  z.object({ action: z.literal("cancel") }),
  z.object({
    action: z.literal("edit"),
    topic: z.string().trim().min(1, "Describe what you'd like to discuss").max(200),
    proposedTimes: z
      .array(z.string().trim().min(1))
      .min(1, "Propose at least one time")
      .max(5, "Propose at most 5 times"),
    message: z.string().trim().max(1000).nullable(),
  }),
]);

export type MeetingRequestActionValues = z.infer<typeof meetingRequestActionSchema>;
