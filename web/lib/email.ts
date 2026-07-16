import { Resend } from "resend";
import { Tier } from "@/lib/generated/prisma/enums";
import { TIER_LABELS } from "@/lib/validation/application-review";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "NASIHA <no-reply@nasihaonline.org>";

/**
 * Best-effort: a failed/unconfigured email send must not fail application
 * submission, since the MembershipApplication record is already persisted
 * by the time this runs. Logs instead of throwing.
 */
export async function sendApplicationConfirmationEmail(to: string, firstName: string) {
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY not set — skipping confirmation email to ${to}`);
    return;
  }

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: "Your NASIHA membership application was received",
      text: `Hi ${firstName},\n\nThank you for applying to NASIHA. The Board will review your application and be in touch within 7 days.\n\n— The NASIHA Team`,
    });
  } catch (error) {
    console.error("[email] Failed to send application confirmation email", error);
  }
}

/**
 * Sent by the admin approve action once provisionMemberAccount() has
 * created the Clerk invitation. Best-effort, same as above: a failed send
 * must not undo the approval, which has already happened by this point.
 */
export async function sendWelcomeEmail(to: string, firstName: string, tier: Tier) {
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY not set — skipping welcome email to ${to}`);
    return;
  }

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: "Welcome to NASIHA!",
      text: `Hi ${firstName},\n\nYour NASIHA membership application has been approved, and you've been welcomed as a(n) ${TIER_LABELS[tier]}. Check your inbox for a separate invitation email to set up your account and log in.\n\n— The NASIHA Team`,
    });
  } catch (error) {
    console.error("[email] Failed to send welcome email", error);
  }
}
