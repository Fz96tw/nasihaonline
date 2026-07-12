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
