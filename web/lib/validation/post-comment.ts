import { z } from "zod";

/**
 * POST /api/blog/[slug]/comments body shape (§4.8). A top-level comment
 * omits parentId; a reply sets it to the comment being replied to — the
 * server verifies that comment belongs to the same post before nesting
 * under it, same "trust but verify the thread" pattern as sendMessageSchema.
 */
export const createCommentSchema = z.object({
  body: z.string().trim().min(1, "Comment can't be empty").max(5000),
  parentId: z.string().trim().min(1).nullable(),
});

export type CreateCommentValues = z.infer<typeof createCommentSchema>;
