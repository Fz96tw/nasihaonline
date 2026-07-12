import { z } from "zod";

/**
 * POST /api/inbox/messages body shape (§4.7). A new top-level message
 * (from a Directory card's "Send Message") sets recipientId and omits
 * parentId. A reply sets parentId to the message it's replying to and
 * omits recipientId — the server derives the recipient as "the other party
 * on that (strictly two-party) thread" and resolves parentId to the
 * thread's root before storing, so every reply threads under the original
 * item rather than becoming a new top-level item. subject is only
 * meaningful for a new thread — a reply ignores it (the thread keeps its
 * root subject).
 */
export const sendMessageSchema = z
  .object({
    recipientId: z.string().trim().min(1).nullable(),
    subject: z.string().trim().max(200).nullable(),
    body: z.string().trim().min(1, "Message can't be empty").max(5000),
    parentId: z.string().trim().min(1).nullable(),
  })
  .refine((data) => data.parentId !== null || data.recipientId !== null, {
    message: "Select a recipient",
    path: ["recipientId"],
  });

export type SendMessageValues = z.infer<typeof sendMessageSchema>;
