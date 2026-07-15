import { z } from "zod";

/**
 * POST /api/conduct/report body shape — "Report" on a Directory card
 * (§4.15): a concern about another member's conduct, distinct from
 * content-flagging (see lib/validation/moderation.ts).
 */
export const createConductReportSchema = z.object({
  reportedUserId: z.string().trim().min(1, "Select a member to report"),
  description: z.string().trim().min(1, "Describe the concern").max(2000),
});

export type CreateConductReportValues = z.infer<typeof createConductReportSchema>;

/**
 * PATCH /api/admin/conduct body shape — the admin's recorded action on an
 * open report (§4.15). `id` is the CodeOfConductViolation row being
 * actioned.
 */
export const conductActionSchema = z.object({
  id: z.string().trim().min(1),
  action: z.enum(["warning", "suspension", "removal"]),
});

export type ConductActionValues = z.infer<typeof conductActionSchema>;
