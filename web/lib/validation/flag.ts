import { z } from "zod";

/**
 * Shared body shape for POST /api/{blog,forums/posts,library}/:id/flag
 * (§4.8/§4.9/§4.13). A reason is required — it's stored alongside the flag
 * for the moderator/Steward reviewing it, and flagging has no self-service
 * undo, so this is the flagger's one chance to explain why.
 */
export const flagContentSchema = z.object({
  reason: z.string().trim().min(1, "Tell us why you're flagging this").max(500),
});

export type FlagContentValues = z.infer<typeof flagContentSchema>;
