import { z } from "zod";
import { Role, Tier } from "@/lib/generated/prisma/enums";

export const ROLE_LABELS: Record<Role, string> = {
  [Role.guest]: "Guest",
  [Role.applicant]: "Applicant",
  [Role.member]: "Member",
  [Role.moderator]: "Moderator",
  [Role.admin]: "Admin",
};

export const ROLE_BADGE_VARIANT: Record<Role, "success" | "info" | "warning" | "neutral" | "danger"> = {
  [Role.guest]: "neutral",
  [Role.applicant]: "neutral",
  [Role.member]: "success",
  [Role.moderator]: "info",
  [Role.admin]: "danger",
};

export const updateRoleTierActionSchema = z.object({
  action: z.literal("update_role_tier"),
  role: z.nativeEnum(Role),
  tier: z.nativeEnum(Tier).nullable(),
});

export const suspendActionSchema = z.object({ action: z.literal("suspend") });
export const reinstateActionSchema = z.object({ action: z.literal("reinstate") });

export const userAdminActionSchema = z.discriminatedUnion("action", [
  updateRoleTierActionSchema,
  suspendActionSchema,
  reinstateActionSchema,
]);

export type UserAdminAction = z.infer<typeof userAdminActionSchema>;
