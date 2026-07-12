import { z } from "zod";
import { TeamRoleBadge } from "@/lib/generated/prisma/enums";

export const teamMemberSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  roleBadge: z.nativeEnum(TeamRoleBadge, { message: "Select a role" }),
  title: z.string().trim().min(1, "Title is required").max(120),
  bio: z.string().trim().min(1, "Bio is required").max(2000),
  active: z.boolean(),
});

export type TeamMemberFormValues = z.infer<typeof teamMemberSchema>;

/**
 * Server-side parse of the non-file fields from a multipart FormData
 * request (photo is handled separately via lib/storage.ts). FormData
 * values are always strings, so booleans/enums are coerced explicitly
 * rather than reusing teamMemberSchema directly.
 */
export const teamMemberFormDataSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  roleBadge: z.nativeEnum(TeamRoleBadge, { message: "Select a role" }),
  title: z.string().trim().min(1, "Title is required").max(120),
  bio: z.string().trim().min(1, "Bio is required").max(2000),
  active: z.enum(["true", "false"]).transform((v) => v === "true"),
  // FormData.get() returns null (not undefined) for an absent key — e.g.
  // whenever the "remove photo" checkbox isn't checked — so this must
  // accept null as well as undefined, not just .optional().
  removePhoto: z
    .enum(["true", "false"])
    .nullish()
    .transform((v) => v === "true"),
});

export const reorderSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1),
});
