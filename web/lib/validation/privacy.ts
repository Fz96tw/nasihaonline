import { z } from "zod";

/**
 * POST /api/privacy/requests body shape — a member's export/deletion
 * request from the Settings Privacy section (§4.15).
 */
export const createPrivacyDataRequestSchema = z.object({
  type: z.enum(["export", "deletion"]),
});

export type CreatePrivacyDataRequestValues = z.infer<typeof createPrivacyDataRequestSchema>;

/**
 * PATCH /api/admin/privacy-requests body shape — the admin marking an open
 * request fulfilled. `id` is the PrivacyDataRequest row being resolved.
 */
export const fulfillPrivacyRequestSchema = z.object({
  id: z.string().trim().min(1),
});

export type FulfillPrivacyRequestValues = z.infer<typeof fulfillPrivacyRequestSchema>;
