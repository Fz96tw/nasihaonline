import { z } from "zod";

/**
 * "Compose Announcement" body shape (§4.10) — shared between the admin form
 * (zodResolver) and the server-side parse in POST /api/admin/announcements.
 * The cover image file isn't part of this schema (it travels as a separate
 * FormData entry, validated by uploadAnnouncementHeroImage), same convention
 * as createPostSchema/hero image.
 */
export const createAnnouncementSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(200),
    body: z.string().trim().min(1, "Write something before sending"),
    showInFeed: z.boolean(),
    notifyInApp: z.boolean(),
    sendEmail: z.boolean(),
  })
  .refine((values) => values.showInFeed || values.notifyInApp || values.sendEmail, {
    message: "Select at least one delivery channel",
    path: ["showInFeed"],
  });

export type CreateAnnouncementValues = z.infer<typeof createAnnouncementSchema>;
