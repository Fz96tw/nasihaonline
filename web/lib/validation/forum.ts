import { z } from "zod";
import { ForumThreadVisibility } from "@/lib/generated/prisma/enums";

// Member-Initiated Restricted Forum Threads (§4.13/§11.16) — `invitedUserIds`
// only matters when visibility is `invited` (a `community` thread ignores
// it), same "superRefine only on the restricted branch" shape as
// requireRestrictedEventInvariants in lib/validation/event.ts.
function requireRestrictedThreadInvariants(
  data: { visibility: ForumThreadVisibility; invitedUserIds: string[] },
  ctx: z.RefinementCtx,
) {
  if (data.visibility !== ForumThreadVisibility.invited) return;
  if (data.invitedUserIds.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["invitedUserIds"],
      message: "Select at least one member to invite.",
    });
  }
}

/**
 * "New Thread" body shape (§4.13) — shared between the client form
 * (zodResolver) and POST /api/forums/:forumId/threads's server-side parse,
 * same pattern as createKnowledgeItemSchema. Whether deidentificationConfirmed
 * is actually required depends on which forum the thread is going into,
 * which this schema doesn't know — that gate lives in createForumThread.
 */
export const createForumThreadSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(200),
    body: z.string().trim().min(1, "Post can't be empty").max(10000),
    deidentificationConfirmed: z.boolean(),
    visibility: z.nativeEnum(ForumThreadVisibility),
    invitedUserIds: z.array(z.string()),
  })
  .superRefine(requireRestrictedThreadInvariants);

export type CreateForumThreadValues = z.infer<typeof createForumThreadSchema>;

/**
 * PATCH /api/forums/threads/:threadId/invitees body shape — mirrors
 * updateKnowledgeItemInvitees's route-level inline schema, promoted here so
 * it sits next to createForumThreadSchema.
 */
export const updateForumThreadInviteesSchema = z.object({
  addUserIds: z.array(z.string()).default([]),
  removeUserIds: z.array(z.string()).default([]),
});

export type UpdateForumThreadInviteesValues = z.infer<typeof updateForumThreadInviteesSchema>;

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

/**
 * PATCH /api/forums/posts/:postId body shape — body-only edit, shared by
 * the opening ForumPost and any reply (both are the same ForumPost row
 * shape; only body is ever mutable after posting).
 */
export const updateForumPostSchema = z.object({
  body: z.string().trim().min(1, "Post can't be empty").max(10000),
});

export type UpdateForumPostValues = z.infer<typeof updateForumPostSchema>;

/**
 * PATCH /api/forums/threads/:threadId body shape — title + audience edit
 * for a standalone thread. Reuses requireRestrictedThreadInvariants exactly
 * as createForumThreadSchema does. When the thread is already `invited` and
 * staying `invited`, the client pre-fills invitedUserIds with the thread's
 * current roster purely to satisfy this invariant — updateForumThread
 * ignores the field entirely in that case (roster changes keep going
 * through the existing PATCH .../invitees endpoint).
 */
export const updateForumThreadSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(200),
    visibility: z.nativeEnum(ForumThreadVisibility),
    invitedUserIds: z.array(z.string()),
  })
  .superRefine(requireRestrictedThreadInvariants);

export type UpdateForumThreadValues = z.infer<typeof updateForumThreadSchema>;
