import { z } from "zod";

/**
 * "New Thread" body shape (§4.13) — shared between the client form
 * (zodResolver) and POST /api/forums/:forumId/threads's server-side parse,
 * same pattern as createKnowledgeItemSchema. Whether deidentificationConfirmed
 * is actually required depends on which forum the thread is going into,
 * which this schema doesn't know — that gate lives in createForumThread.
 */
export const createForumThreadSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  body: z.string().trim().min(1, "Post can't be empty").max(10000),
  deidentificationConfirmed: z.boolean(),
});

export type CreateForumThreadValues = z.infer<typeof createForumThreadSchema>;

/**
 * POST /api/forums/threads/:threadId/posts body shape (§4.13). A top-level
 * reply omits parentId; replying to a specific post sets it — the server
 * verifies that post belongs to the same thread before nesting under it,
 * same "trust but verify the thread" pattern as createCommentSchema.
 */
export const createForumPostSchema = z.object({
  body: z.string().trim().min(1, "Reply can't be empty").max(10000),
  parentId: z.string().trim().min(1).nullable(),
  deidentificationConfirmed: z.boolean(),
});

export type CreateForumPostValues = z.infer<typeof createForumPostSchema>;
