import { z } from "zod";
import {
  CareerStage,
  ApplicationAvailability,
  HowHeardSource,
  Tier,
} from "@/lib/generated/prisma/enums";

export const CAREER_STAGE_LABELS: Record<CareerStage, string> = {
  [CareerStage.expert]: "Expert",
  [CareerStage.early_career]: "Early Career",
  [CareerStage.student]: "Student",
};

export const AVAILABILITY_LABELS: Record<ApplicationAvailability, string> = {
  [ApplicationAvailability.virtual_meeting]: "Virtual Meeting",
  [ApplicationAvailability.in_person]: "In-Person",
  [ApplicationAvailability.online_review]: "Online Review",
};

export const HOW_HEARD_LABELS: Record<HowHeardSource, string> = {
  [HowHeardSource.online_search]: "From online search",
  [HowHeardSource.colleague]: "From a colleague",
  [HowHeardSource.member]: "From another NASIHA member",
  [HowHeardSource.other]: "Other",
};

/**
 * /join collects only what's needed to identify an applicant and route the
 * Board's approve/reject decision (PRD §3.1). Career stage, availability,
 * interest areas, why-join, expertise, and professional reference — all
 * previously collected here — are now filled in by the member on their own
 * Profile (§4.3) after a first sign-in redirect (see the (member) layout),
 * not gathered up front.
 */
const baseApplicationSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().min(1, "Last name is required"),
  email: z.string().trim().email("Enter a valid email address"),
  professionalTitle: z.string().trim().min(1, "Professional title / occupation is required"),
  // The only optional field on this form — the applicant can add this to
  // their Profile later if they skip it here.
  linkedinUrl: z.string().trim(),
  countryRegion: z.string().trim().min(1, "Country / region is required"),
  // Applicant's own tier preference — a non-binding hint only (see
  // requestedTier on MembershipApplication) but required at submission time
  // regardless, same as every other field but linkedinUrl.
  requestedTier: z.nativeEnum(Tier, { message: "Select a tier" }),
  howHeardSource: z.nativeEnum(HowHeardSource, { message: "Let us know how you heard about NASIHA" }),
  // Requiredness depends on howHeardSource — see superRefine below. Kept as
  // plain (non-optional-typed) strings, same RHF/zodResolver rationale as
  // the other optional text fields in this schema.
  howHeardMemberName: z.string().trim(),
  howHeardOtherDetail: z.string().trim(),
  codeOfConductAccepted: z
    .boolean()
    .refine((v) => v === true, { message: "You must accept the Code of Conduct to apply" }),
  emailUpdatesOptIn: z.boolean(),
});

export type ApplicationFormValues = z.infer<typeof baseApplicationSchema>;

export const applicationSchema = baseApplicationSchema.superRefine((values, ctx) => {
  if (values.howHeardSource === HowHeardSource.member && !values.howHeardMemberName) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["howHeardMemberName"],
      message: "Let us know which member referred you",
    });
  }
  if (values.howHeardSource === HowHeardSource.other && !values.howHeardOtherDetail) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["howHeardOtherDetail"],
      message: "Tell us a bit more",
    });
  }
});
