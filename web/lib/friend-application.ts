import { db } from "@/lib/db";
import { Tier } from "@/lib/generated/prisma/enums";
import { sendApplicationConfirmationEmail } from "@/lib/email";
import { findDuplicateApplicant } from "@/lib/applications";

function splitName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim();
  const spaceIndex = trimmed.indexOf(" ");
  if (spaceIndex === -1) return { firstName: trimmed, lastName: "" };
  return { firstName: trimmed.slice(0, spaceIndex), lastName: trimmed.slice(spaceIndex + 1).trim() };
}

/**
 * Auto-submits a Friend of NASIHA MembershipApplication from the donate
 * form's "also apply as a Friend" checkbox (PRD §4.14) — called from the
 * Stripe webhook right after a Donation row is created. This still goes
 * through the normal admin review queue (/admin/applications) exactly like
 * a manually-submitted application; it only saves the donor the step of
 * filling out /join separately. Career/interest fields the donate form
 * never collected are left blank (sourcedFromDonation flags this for the
 * admin) rather than fabricated.
 *
 * Skips silently (no application, no error) if the email already has a
 * pending or approved application, or an existing member account — so a
 * recurring donor's renewal payments never create duplicates. A
 * previously-rejected application does not block a fresh one.
 */
export async function autoSubmitFriendApplication({
  donorName,
  donorEmail,
  emailUpdatesOptIn,
}: {
  donorName: string;
  donorEmail: string;
  emailUpdatesOptIn: boolean;
}) {
  if (await findDuplicateApplicant(donorEmail)) return;

  const { firstName, lastName } = splitName(donorName);

  const application = await db.membershipApplication.create({
    data: {
      firstName,
      lastName,
      email: donorEmail,
      professionalTitle: "",
      careerStage: null,
      availability: [],
      areaOfInterest: [],
      countryRegion: "",
      referral: null,
      whyJoin: "",
      expertiseToShare: "",
      topicsToLearn: "",
      professionalReferenceName: null,
      professionalReferenceContact: null,
      codeOfConductAcceptedAt: new Date(),
      emailUpdatesOptIn,
      requestedTier: Tier.friend,
      sourcedFromDonation: true,
    },
  });

  await sendApplicationConfirmationEmail(application.email, application.firstName);
}
