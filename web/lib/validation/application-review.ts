import { z } from "zod";
import { Tier } from "@/lib/generated/prisma/enums";

export const TIER_LABELS: Record<Tier, string> = {
  [Tier.active]: "Active Member",
  [Tier.associate]: "Associate",
  [Tier.student]: "Student / Trainee",
  [Tier.friend]: "Friend of NASIHA",
};

export const approveActionSchema = z.object({
  action: z.literal("approve"),
  tier: z.nativeEnum(Tier, { message: "Select a tier to approve this applicant" }),
});

export const rejectActionSchema = z.object({
  action: z.literal("reject"),
  adminNote: z.string().trim().min(1, "A note is required to reject an application"),
  visibleToApplicant: z.boolean(),
});

export const applicationReviewActionSchema = z.discriminatedUnion("action", [
  approveActionSchema,
  rejectActionSchema,
]);

export type ApplicationReviewAction = z.infer<typeof applicationReviewActionSchema>;
