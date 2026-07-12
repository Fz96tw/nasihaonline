import { z } from "zod";
import { DonationFrequency } from "@/lib/generated/prisma/enums";

export const donationSchema = z.object({
  donorName: z.string().trim().min(1, "Name is required"),
  donorEmail: z.string().trim().email("Enter a valid email address"),
  // Dollars, not cents — converted to amountCents server-side right before
  // creating the Stripe Checkout Session (lib/validation stays currency-unit
  // agnostic; Stripe's minimum charge is enforced by Stripe itself). Kept as
  // z.number() (not z.coerce.number()) so the resolver's input/output types
  // match for RHF's zodResolver generic — the Input's onChange converts the
  // DOM string value to a number before calling field.onChange (see
  // components/donate-form.tsx).
  amount: z.number().min(1, "Minimum donation is $1").max(100000, "Amount is too large"),
  frequency: z.nativeEnum(DonationFrequency, { message: "Select one-time or recurring" }),
  recognitionConsent: z.boolean(),
  // Kept non-optional (possibly empty) rather than z.optional() so the
  // schema's input/output types match exactly for RHF's zodResolver
  // generic — same rationale as ApplicationFormValues.referral.
  note: z.string().trim().max(500, "Note is too long"),
});

export type DonationFormValues = z.infer<typeof donationSchema>;
