import { z } from "zod";
import { EventType, EventVisibility, RecurrenceFrequency } from "@/lib/generated/prisma/enums";

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
  meetingUrl: z
    .string()
    .trim()
    .max(500)
    .refine((value) => /^https?:\/\//i.test(value), "Enter a valid URL (starting with http:// or https://)")
    .nullable(),
  deidentificationConfirmed: z.boolean(),
  // The submitting browser's IANA zone (e.g. "America/New_York"), captured
  // via Intl.DateTimeFormat().resolvedOptions().timeZone alongside
  // startsAt/endsAt — see Event.timezone's schema comment. Nullable rather
  // than required so a request that somehow omits it (an old client, a
  // direct API call) still creates/edits the event rather than failing
  // outright; formatEventDateTime falls back to a fixed default zone when
  // it's null.
  timezone: z.string().trim().min(1).nullable(),
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

// Audience-Restricted Group Events, Objective 01. `invitedUserIds`/
// `meetLinkSource` only matter when visibility is `invited` — a community
// event ignores both (same manual-only meetingUrl behavior as before this
// objective), enforced by requireRestrictedEventInvariants below rather
// than by conditionally omitting the fields from the schema.
function requireRestrictedEventInvariants(
  data: {
    visibility: EventVisibility;
    invitedUserIds: string[];
    meetLinkSource: "auto" | "manual";
    meetingUrl: string | null;
    open: boolean;
  },
  ctx: z.RefinementCtx,
) {
  if (data.visibility !== EventVisibility.invited) return;

  // "Open to the public" gates the anonymous /events registration flow —
  // nonsensical for an event that's simultaneously restricted to a named
  // invite list, and a real bypass risk if combined: the public register
  // route only ever checked `open`, not `visibility` (fixed separately in
  // registerForEvent, but this is where a host would actually set it).
  if (data.open) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["open"],
      message: "Restricted events can't be open to the public.",
    });
  }
  if (data.invitedUserIds.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["invitedUserIds"],
      message: "Select at least one member to invite.",
    });
  }
  if (data.meetLinkSource === "manual" && !data.meetingUrl) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["meetingUrl"],
      message: "Enter a meeting link, or switch to auto-generate.",
    });
  }
}

// Repeat schedule (§4.6 "Recurring events") — null means "does not repeat".
// Shared by createEventSchema and updateEventSchema: editing an
// already-recurring series' rule (or adding/removing recurrence entirely)
// is the supported "whole series" edit, unlike the create-only
// invitedUserIds/meetLinkSource fields.
const recurrenceInputSchema = z
  .object({
    frequency: z.nativeEnum(RecurrenceFrequency),
    interval: z.coerce.number().int().min(1).max(52),
    byWeekday: z.array(z.number().int().min(0).max(6)).max(7),
    // ISO string like startsAt/endsAt — parsed to a Date in events-server.ts.
    until: z.string().trim().min(1).nullable(),
  })
  .nullable();

function requireRecurrenceInvariants(
  data: { startsAt: string; recurrence: z.infer<typeof recurrenceInputSchema> },
  ctx: z.RefinementCtx,
) {
  if (!data.recurrence) return;
  if (data.recurrence.frequency === RecurrenceFrequency.weekly && data.recurrence.byWeekday.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["recurrence", "byWeekday"],
      message: "Select at least one day of the week.",
    });
  }
  if (data.recurrence.until) {
    const until = new Date(data.recurrence.until);
    const startsAt = new Date(data.startsAt);
    if (Number.isNaN(until.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["recurrence", "until"], message: "Enter a valid end date." });
    } else if (until <= startsAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["recurrence", "until"],
        message: '"Repeat until" must be after the start date.',
      });
    }
  }
}

/**
 * POST /api/events body shape — "Submit Event" (§4.6). Shared between the
 * client form (zodResolver) and the API route's server-side parse.
 */
export const createEventSchema = eventFieldsSchema
  .extend({
    visibility: z.nativeEnum(EventVisibility),
    invitedUserIds: z.array(z.string()),
    meetLinkSource: z.enum(["auto", "manual"]),
    recurrence: recurrenceInputSchema,
  })
  .superRefine(requireDeidentificationForCaseDiscussion)
  .superRefine(requireRestrictedEventInvariants)
  .superRefine(requireRecurrenceInvariants);

export type CreateEventValues = z.infer<typeof createEventSchema>;

/**
 * PATCH /api/events/:id body shape — editing an event (§4.6), host or admin
 * only (enforced in updateEvent). The linked discussion thread (if any) is
 * untouched by an edit — starting one at all is the on-demand "Start a
 * Discussion" button on the event detail page, not a create/edit form field.
 */
export const updateEventSchema = eventFieldsSchema
  .extend({ recurrence: recurrenceInputSchema })
  .superRefine(requireDeidentificationForCaseDiscussion)
  .superRefine(requireRecurrenceInvariants);

export type UpdateEventValues = z.infer<typeof updateEventSchema>;
