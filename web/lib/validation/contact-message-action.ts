import { z } from "zod";

export const contactMessageActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("read"),
    note: z.string().trim().min(1, "A short note is required").max(500, "Note is too long"),
  }),
  z.object({
    action: z.literal("reply"),
    body: z.string().trim().min(1, "A reply body is required").max(5000, "Reply is too long"),
  }),
]);

export type ContactMessageActionValues = z.infer<typeof contactMessageActionSchema>;
