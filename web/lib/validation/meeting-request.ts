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
});

export type CreateMeetingRequestValues = z.infer<typeof createMeetingRequestSchema>;

/**
 * PATCH /api/inbox/meeting-requests/:id body shape — the recipient's
 * response (§4.7): accept, decline, or propose a new time. Only
 * `reschedule` carries a payload (the counter-proposed times); accept/decline
 * are pending -> {accepted|declined} with no further input.
 */
export const meetingRequestActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("accept") }),
  z.object({ action: z.literal("decline") }),
  z.object({
    action: z.literal("reschedule"),
    proposedTimes: z
      .array(z.string().trim().min(1))
      .min(1, "Propose at least one time")
      .max(5, "Propose at most 5 times"),
    message: z.string().trim().max(1000).nullable(),
  }),
]);

export type MeetingRequestActionValues = z.infer<typeof meetingRequestActionSchema>;
