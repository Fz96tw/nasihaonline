import { z } from "zod";

/**
 * Community-based-categorization initiative, objective 2. Enforces the
 * "at least one of (flag set) or (≥1 row)" floor server-side too, not just
 * in the form UI — shared by both the onboarding gate and the header
 * search row's later edit affordance, since both submit through the same
 * PATCH /api/profile/communities endpoint.
 */
export const profileCommunitiesPatchSchema = z
  .object({
    followsAllCommunities: z.boolean(),
    communityIds: z.array(z.string()),
  })
  .refine((data) => data.followsAllCommunities || data.communityIds.length > 0, {
    message: "Select at least one community, or choose All Communities.",
    path: ["communityIds"],
  });

export type ProfileCommunitiesPatchInput = z.infer<typeof profileCommunitiesPatchSchema>;
