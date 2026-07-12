import { z } from "zod";

/**
 * POST /api/contributions/earn body shape — the "Log Contribution" self-report
 * form (§4.4). `activityKey` must resolve to an active, `earned`-type
 * ContributionRule (validated server-side against the catalog, same pattern
 * as skillIds in profile.ts). Spend/adjusted transactions have no self-report
 * path — they're posted by the accepted-meeting-request and admin-correction
 * flows respectively.
 */
export const logContributionSchema = z.object({
  activityKey: z.string().trim().min(1, "Select an activity"),
  counterpartUserId: z.string().trim().min(1).nullable(),
  note: z.string().trim().max(1000).nullable(),
});

export type LogContributionValues = z.infer<typeof logContributionSchema>;

/**
 * POST /api/contributions/:id/reject body shape when rejecting in an admin
 * capacity — a reason is required (§4.4 audit requirement, same pattern as
 * application rejection's adminNote). A named counterpart rejecting their
 * own peer-confirmation entry sends no body at all; this schema is only
 * used by the admin-facing reject dialog.
 */
export const rejectContributionSchema = z.object({
  reason: z.string().trim().min(1, "A reason is required to reject this contribution.").max(1000),
});

export type RejectContributionValues = z.infer<typeof rejectContributionSchema>;
