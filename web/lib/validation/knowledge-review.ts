import { z } from "zod";

/** POST /api/admin/library/:id/publish body shape (§4.9) — Steward/admin review action. */
export const knowledgeReviewActionSchema = z.object({
  action: z.enum(["publish", "reject"]),
});

export type KnowledgeReviewAction = z.infer<typeof knowledgeReviewActionSchema>;
