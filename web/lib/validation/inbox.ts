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

/** PATCH /api/inbox/messages/:id body shape — body-only edit, same constraint as sendMessageSchema's body. */
export const editMessageSchema = z.object({
  body: z.string().trim().min(1, "Message can't be empty").max(5000),
});

export type EditMessageValues = z.infer<typeof editMessageSchema>;

/**
 * POST /api/inbox/groups body shape (§4.7) — a group message, sent when the
 * Inbox composer has two or more recipients. Subject is required (it's the
 * group's title); the 20-participant cap (author included) leaves room for
 * 19 recipients. Body limit matches a forum post's, since that's what the
 * first message is stored as.
 */
export const createGroupMessageSchema = z.object({
  recipientIds: z
    .array(z.string().trim().min(1))
    .min(2, "Pick at least two members for a group message")
    .max(19, "A group message can have at most 20 people, you included"),
  subject: z.string().trim().min(1, "A group message needs a subject").max(200),
  body: z.string().trim().min(1, "Message can't be empty").max(10000),
});

export type CreateGroupMessageValues = z.infer<typeof createGroupMessageSchema>;
