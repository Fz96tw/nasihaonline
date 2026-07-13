import { z } from "zod";
import { EventType } from "@/lib/generated/prisma/enums";

/**
 * POST /api/events body shape — "Submit Event" (§4.6). Shared between the
 * client form (zodResolver) and the API route's server-side parse, so the
 * Case Discussion de-identification checkbox (§11's hard requirement, not
 * optional) is enforced identically on both sides rather than only in the
 * UI. startsAt/endsAt are ISO strings (converted from the browser's
 * datetime-local input client-side, same as createMeetingRequestSchema) —
 * parsed into Dates in lib/events-server.ts, not here.
 */
export const createEventSchema = z
  .object({
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
  })
  .superRefine((data, ctx) => {
    if (data.type === EventType.case_discussion && !data.deidentificationConfirmed) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["deidentificationConfirmed"],
        message: "You must confirm no identifiable patient information will be shared.",
      });
    }
  });

export type CreateEventValues = z.infer<typeof createEventSchema>;
