import { z } from "zod";
import {
  AdmissionPhase,
  CareerStage,
  ApplicationAvailability,
  AreaOfInterest,
  InterestArea,
  Tier,
} from "@/lib/generated/prisma/enums";
import { professionalReferenceRequired } from "@/lib/admission-phase";

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

export const AREA_OF_INTEREST_LABELS: Record<AreaOfInterest, string> = {
  [AreaOfInterest.healthcare]: "Healthcare",
  [AreaOfInterest.science]: "Science",
  [AreaOfInterest.law]: "Law",
  [AreaOfInterest.business]: "Business",
  [AreaOfInterest.it]: "IT",
};

const baseApplicationSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().min(1, "Last name is required"),
  email: z.string().trim().email("Enter a valid email address"),
  professionalTitle: z.string().trim().min(1, "Professional title / specialty is required"),
  // Applicant's own tier preference — a non-binding hint only (see
  // requestedTier on MembershipApplication). Optional, so "" (unselected)
  // must be a valid value alongside the real Tier enum members; kept as a
  // plain union rather than z.optional() to match the RHF Select's string
  // value type, same rationale as `referral` above.
  requestedTier: z.union([z.nativeEnum(Tier), z.literal("")]),
  careerStage: z.nativeEnum(CareerStage, { message: "Select a career stage" }),
  availability: z
    .array(z.nativeEnum(ApplicationAvailability))
    .min(1, "Select at least one availability option"),
  areaOfInterest: z
    .array(z.nativeEnum(AreaOfInterest))
    .min(1, "Select at least one area of interest"),
  // Granular interest tags (distinct from areaOfInterest above) — optional,
  // supplementary to the required broad category selection.
  interestAreas: z.array(z.nativeEnum(InterestArea)),
  countryRegion: z.string().trim().min(1, "Country / region is required"),
  // Optional field: plain (non-optional-typed) string kept possibly empty,
  // rather than z.optional(), so the schema's input/output types match
  // exactly — required for RHF's zodResolver generic to line up with
  // ApplicationFormValues (see useForm<ApplicationFormValues> in JoinForm).
  referral: z.string().trim(),
  // whyJoin/expertiseToShare requiredness (like professionalReference below)
  // depends on requestedTier — Friend of NASIHA applicants skip these
  // fields entirely, so the min-length checks live in applicationSchema's
  // superRefine instead of being baked into the base schema here.
  whyJoin: z.string().trim(),
  expertiseToShare: z.string().trim(),
  topicsToLearn: z.string().trim().min(1, "Let us know what you'd like to learn"),
  professionalReferenceName: z.string().trim(),
  professionalReferenceContact: z.string().trim(),
  codeOfConductAccepted: z
    .boolean()
    .refine((v) => v === true, { message: "You must accept the Code of Conduct to apply" }),
  emailUpdatesOptIn: z.boolean(),
});

export type ApplicationFormValues = z.infer<typeof baseApplicationSchema>;

/**
 * professionalReference* is always collected but only *required* once the
 * admin-configured admission phase reaches Open Applications (PRD §3.1/§3.2)
 * — enforced here via superRefine so the same schema shape (and RHF field
 * types) hold across phases; only the requiredness changes.
 *
 * whyJoin/expertiseToShare/professionalReference* are all skipped for
 * Friend of NASIHA applicants (requestedTier === "friend") — those fields
 * are hidden in JoinForm for that tier, so they must not be required here.
 */
export function applicationSchema(phase: AdmissionPhase) {
  const referenceRequired = professionalReferenceRequired(phase);
  return baseApplicationSchema.superRefine((values, ctx) => {
    const isFriendTier = values.requestedTier === Tier.friend;

    if (!isFriendTier) {
      if (values.whyJoin.length < 20) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["whyJoin"],
          message: "Tell us a bit more (at least 20 characters)",
        });
      }
      if (!values.expertiseToShare) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["expertiseToShare"],
          message: "Let us know what you'd like to share",
        });
      }
    }

    if (!referenceRequired || isFriendTier) return;
    if (!values.professionalReferenceName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["professionalReferenceName"],
        message: "A professional reference is required during Open Applications",
      });
    }
    if (!values.professionalReferenceContact) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["professionalReferenceContact"],
        message: "Reference contact info is required during Open Applications",
      });
    }
  });
}
