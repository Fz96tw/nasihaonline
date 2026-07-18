import { Resend } from "resend";
import { Tier } from "@/lib/generated/prisma/enums";
import { TIER_LABELS } from "@/lib/validation/application-review";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "NASIHA <no-reply@nasihaonline.org>";
const CONTACT_EMAIL = process.env.CONTACT_INBOX_EMAIL ?? "info@nasihaforyou.org";

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

/**
 * Sent right after an anonymous visitor registers for an `open` event via
 * the public /events page. Best-effort, same as above: the EventRegistration
 * row is already persisted by the time this runs, so a failed/unconfigured
 * send must not surface as an error to the visitor. No meeting/join link —
 * that's never exposed on the public page today, for members or otherwise.
 */
export async function sendEventRegistrationConfirmationEmail(
  to: string,
  name: string,
  event: { title: string; startsAt: Date },
) {
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY not set — skipping event registration email to ${to}`);
    return;
  }

  const when = event.startsAt.toLocaleString("en-US", {
    dateStyle: "full",
    timeStyle: "short",
  });

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: `You're registered: ${event.title}`,
      text: `Hi ${name},\n\nYou're registered for "${event.title}" on ${when}. We'll be in touch with more details closer to the event.\n\n— The NASIHA Team`,
    });
  } catch (error) {
    console.error("[email] Failed to send event registration confirmation email", error);
  }
}

/**
 * Notifies the org's contact inbox of a new /contact form submission.
 * Best-effort, same as above: the ContactMessage row is already persisted
 * by the time this runs, so it's the fallback if this send fails or
 * RESEND_API_KEY isn't configured. replyTo is set to the submitter's
 * address so the org can reply directly from their inbox.
 */
export async function sendContactMessageEmail(message: {
  name: string;
  email: string;
  subject: string;
  message: string;
}) {
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY not set — skipping contact notification from ${message.email}`);
    return;
  }

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: CONTACT_EMAIL,
      replyTo: message.email,
      subject: `[Contact form] ${message.subject}`,
      text: `From: ${message.name} <${message.email}>\n\n${message.message}`,
    });
  } catch (error) {
    console.error("[email] Failed to send contact notification email", error);
  }
}
