import { Resend } from "resend";
import { Tier } from "@/lib/generated/prisma/enums";
import { TIER_LABELS } from "@/lib/validation/application-review";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "NASIHA <no-reply@mail.nasihaforyou.org>";
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
 *
 * inviteUrl is the accept-invite link from Clerk's invitation response.
 * provisionMemberAccount() creates that invitation with notify: false, so
 * Clerk never sends its own email for it (those count against Clerk's
 * dev-instance monthly email cap) — this welcome email is the only place
 * the applicant receives the link to set up their account.
 */
export async function sendWelcomeEmail(to: string, firstName: string, tier: Tier, inviteUrl: string) {
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY not set — skipping welcome email to ${to}`);
    return;
  }

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: "Welcome to NASIHA!",
      text: `Hi ${firstName},\n\nYour NASIHA membership application has been approved, and you've been welcomed as a(n) ${TIER_LABELS[tier]}. Set up your account and log in here:\n\n${inviteUrl}\n\n— The NASIHA Team`,
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
const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

/**
 * Sent to every member once an admin sends a Board Announcement (§4.10).
 * The one email in this file with an `html` body, not just `text` — the
 * optional cover image can only render as an inline <img>, plain text has
 * no way to show it. `from` is overridden to "NASIHA Board" (rather than
 * this file's default "NASIHA") to match the masked institutional sender
 * identity shown everywhere else the announcement appears (feed, detail
 * page) — see lib/feed-server.ts's ANNOUNCEMENT_SENDER. Best-effort, same
 * as every other function here: the Announcement/Notification rows already
 * exist by the time this runs, so a failed/unconfigured send is non-fatal.
 */
export async function sendAnnouncementEmail(
  to: string,
  announcement: { title: string; body: string; heroImageUrl: string | null; detailUrl: string },
) {
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY not set — skipping announcement email to ${to}`);
    return;
  }

  const safeTitle = escapeHtml(announcement.title);
  const safeBody = escapeHtml(announcement.body).replace(/\n/g, "<br>");
  const imageHtml = announcement.heroImageUrl
    ? `<img src="${announcement.heroImageUrl}" alt="" style="max-width:100%;border-radius:8px;margin-bottom:16px" />`
    : "";

  try {
    await resend.emails.send({
      from: "NASIHA Board <no-reply@mail.nasihaforyou.org>",
      to,
      subject: announcement.title,
      text: `${announcement.title}\n\n${announcement.body}\n\nView online: ${announcement.detailUrl}`,
      html: `<div>${imageHtml}<h1>${safeTitle}</h1><p>${safeBody}</p><p><a href="${announcement.detailUrl}">View online</a></p></div>`,
    });
  } catch (error) {
    console.error("[email] Failed to send announcement email", error);
  }
}

/**
 * Sent to each SurveyInvitation recipient once a survey is scheduled/opened.
 * respondUrl already carries the recipient's unique token (the magic link
 * that authenticates their response — no login, member or not). `from` is
 * overridden to "NASIHA Board" (rather than this file's default "NASIHA")
 * to match the masked institutional sender identity shown everywhere else
 * an admin-authored survey appears — the feed row, same rationale as
 * sendAnnouncementEmail's identical override (see lib/feed-server.ts's
 * BOARD_SENDER). Best-effort, same rationale as every other function here:
 * the Survey + SurveyInvitation rows already exist by the time this runs,
 * so a failed/unconfigured send is non-fatal.
 */
export async function sendSurveyInviteEmail(
  to: string,
  survey: { title: string; description: string | null; heroImageUrl: string | null; respondUrl: string },
) {
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY not set — skipping survey invite email to ${to}`);
    return;
  }

  const safeTitle = escapeHtml(survey.title);
  const safeDescription = survey.description ? escapeHtml(survey.description).replace(/\n/g, "<br>") : "";
  const imageHtml = survey.heroImageUrl
    ? `<img src="${survey.heroImageUrl}" alt="" style="max-width:100%;border-radius:8px;margin-bottom:16px" />`
    : "";

  try {
    await resend.emails.send({
      from: "NASIHA Board <no-reply@mail.nasihaforyou.org>",
      to,
      subject: `Survey: ${survey.title}`,
      text: `${survey.title}\n${survey.description ? `\n${survey.description}\n` : ""}\nShare your feedback here:\n${survey.respondUrl}\n\n— The NASIHA Team`,
      html: `<div>${imageHtml}<h1>${safeTitle}</h1>${safeDescription ? `<p>${safeDescription}</p>` : ""}<p><a href="${survey.respondUrl}">Take the survey</a></p></div>`,
    });
  } catch (error) {
    console.error("[email] Failed to send survey invite email", error);
  }
}

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
