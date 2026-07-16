import { z } from "zod";

/**
 * "Write a Post" body shape (§4.8) — shared between the client form
 * (zodResolver) and the server-side parse in POST /api/blog, same pattern
 * as createEventSchema. The hero image file isn't part of this schema (it
 * travels as a separate FormData entry, validated by uploadPostHeroImage);
 * licenseConsented must be `true` to submit at all, enforcing the
 * content-licensing gate (§4.15) client- and server-side identically.
 */
export const createPostSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  body: z.string().trim().min(1, "Write something before publishing"),
  categoryId: z.string().trim().min(1, "Select a category"),
  tagIds: z.array(z.string()),
  licenseConsented: z
    .boolean()
    .refine((value) => value === true, "You must acknowledge the content licensing terms to publish."),
});

export type CreatePostValues = z.infer<typeof createPostSchema>;

/**
 * PATCH /api/blog/:slug body shape (§4.8, §11.12) — same fields as
 * createPostSchema minus licenseConsented, since editing doesn't re-trigger
 * the one-time content-licensing consent from the original publish.
 */
export const updatePostSchema = createPostSchema.omit({ licenseConsented: true });

export type UpdatePostValues = z.infer<typeof updatePostSchema>;
