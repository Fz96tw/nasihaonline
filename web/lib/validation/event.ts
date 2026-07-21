import { z } from "zod";
import { EventType } from "@/lib/generated/prisma/enums";

// Shared by createEventSchema and updateEventSchema below — startsAt/endsAt
// are ISO strings (converted from the browser's datetime-local input
// client-side, same as createMeetingRequestSchema) — parsed into Dates in
// lib/events-server.ts, not here.
const eventFieldsSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().trim().max(2000).nullable(),
  type: z.nativeEnum(EventType, { message: "Select an event type" }),
  startsAt: z.string().trim().min(1, "Start date and time are required"),
  endsAt: z.string().trim().min(1).nullable(),
  open: z.boolean(),
  icon: z.string().trim().max(8).nullable(),
  meetingUrl: z
    .string()
    .trim()
    .max(500)
    .refine((value) => /^https?:\/\//i.test(value), "Enter a valid URL (starting with http:// or https://)")
    .nullable(),
  deidentificationConfirmed: z.boolean(),
});

// Case Discussion's de-identification checkbox (§11's hard requirement, not
// optional) — enforced identically create and edit, so a host can't clear
// it by editing an existing Case Discussion event either.
function requireDeidentificationForCaseDiscussion(
  data: { type: EventType; deidentificationConfirmed: boolean },
  ctx: z.RefinementCtx,
) {
  if (data.type === EventType.case_discussion && !data.deidentificationConfirmed) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["deidentificationConfirmed"],
      message: "You must confirm no identifiable patient information will be shared.",
    });
  }
}

/**
 * POST /api/events body shape — "Submit Event" (§4.6). Shared between the
 * client form (zodResolver) and the API route's server-side parse.
 */
export const createEventSchema = eventFieldsSchema
  .extend({ createDiscussionThread: z.boolean() })
  .superRefine(requireDeidentificationForCaseDiscussion);

export type CreateEventValues = z.infer<typeof createEventSchema>;

/**
 * PATCH /api/events/:id body shape — editing an event (§4.6), host or admin
 * only (enforced in updateEvent). Omits createDiscussionThread: that's a
 * one-time create-time action, not something an edit can retroactively
 * toggle — the linked thread (if any) is untouched by an edit.
 */
export const updateEventSchema = eventFieldsSchema.superRefine(requireDeidentificationForCaseDiscussion);

export type UpdateEventValues = z.infer<typeof updateEventSchema>;
