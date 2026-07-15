import { z } from "zod";
import { MODERATION_TYPES } from "@/lib/moderation";

export const moderationActionSchema = z.object({
  type: z.enum(MODERATION_TYPES),
  action: z.enum(["dismiss", "remove"]),
});

export type ModerationAction = z.infer<typeof moderationActionSchema>;
