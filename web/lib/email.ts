import { Resend } from "resend";
import { Tier, ContactService } from "@/lib/generated/prisma/enums";
import type { MembershipApplicationModel } from "@/lib/generated/prisma/models/MembershipApplication";
import { TIER_LABELS } from "@/lib/validation/application-review";
import { CONTACT_SERVICE_LABELS } from "@/lib/validation/contact";
import { HOW_HEARD_LABELS } from "@/lib/validation/application";
import { formatEventDateTime } from "@/lib/format-date";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "NASIHA <no-reply@mail.nasihaforyou.org>";
const CONTACT_EMAIL = process.env.CONTACT_INBOX_EMAIL ?? "info@nasihaforyou.org";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";

/**
 * Best-effort: a failed/unconfigured email send must not fail application
 * submission, since the MembershipApplication record is already persisted
 * by the time this runs. Logs instead of throwing.
 */
function formatApplicationSummary(application: MembershipApplicationModel): string {
  const lines: Array<[string, string]> = [
    ["Name", `${application.firstName} ${application.lastName}`],
    ["Email", application.email],
    ["Professional title / specialty", application.professionalTitle || "—"],
    ["LinkedIn", application.linkedinUrl || "—"],
    ["Requested tier", application.requestedTier ? TIER_LABELS[application.requestedTier] : "—"],
    ["Country / region", application.countryRegion],
    [
      "How did you hear about NASIHA?",
      application.howHeardSource
        ? [HOW_HEARD_LABELS[application.howHeardSource], application.howHeardMemberName, application.howHeardOtherDetail]
            .filter(Boolean)
            .join(" — ")
        : "—",
    ],
    ["Email updates opt-in", application.emailUpdatesOptIn ? "Yes" : "No"],
  ];

  return lines.map(([label, value]) => `${label}: ${value}`).join("\n");
}

export async function sendApplicationConfirmationEmail(application: MembershipApplicationModel) {
  const to = application.email;
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY not set — skipping confirmation email to ${to}`);
    return;
  }

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: "Your NASIHA membership application was received",
      text: `Hi ${application.firstName},\n\nThank you for applying to NASIHA. The Board will review your application and be in touch within 7 days.\n\n— The NASIHA Team\n\n---\nA copy of your submitted application:\n\n${formatApplicationSummary(application)}`,
    });
  } catch (error) {
    console.error("[email] Failed to send application confirmation email", error);
  }
}

export type SendResult = { ok: true } | { ok: false; error: string };

/**
 * Sent by the admin approve action once provisionMemberAccount() has
 * created the Clerk invitation. Best-effort, same as above: a failed send
 * must not undo the approval, which has already happened by this point.
 * Callers surface the returned status to the admin rather than treating a
 * resolved promise as success — the Resend SDK resolves normally with an
 * `error` field on API-level failures (bad recipient, etc.) instead of
 * throwing, so that has to be checked explicitly.
 *
 * inviteUrl is the accept-invite link from Clerk's invitation response.
 * provisionMemberAccount() creates that invitation with notify: false, so
 * Clerk never sends its own email for it (those count against Clerk's
 * dev-instance monthly email cap) — this welcome email is the only place
 * the applicant receives the link to set up their account.
 */
export async function sendWelcomeEmail(
  to: string,
  firstName: string,
  tier: Tier,
  inviteUrl: string,
): Promise<SendResult> {
  if (!resend) {
    const error = "RESEND_API_KEY not set";
    console.warn(`[email] ${error} — skipping welcome email to ${to}`);
    return { ok: false, error };
  }

  const safeFirstName = escapeHtml(firstName);
  const safeTierLabel = escapeHtml(TIER_LABELS[tier]);

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      bcc: "nasihaforyou@gmail.com",
      subject: "Welcome to NASIHA!",
      text: `Hi ${firstName},\n\nYour NASIHA membership application has been approved, and you've been welcomed as a(n) ${TIER_LABELS[tier]}. Set up your account and log in here:\n\n${inviteUrl}\n\nIf you've received this email more than once, only the link in the most recent one still works — earlier links are no longer valid.\n\n— The NASIHA Team`,
      html: `<div>
        <p>Hi ${safeFirstName},</p>
        <p>Your NASIHA membership application has been approved, and you've been welcomed as a(n) ${safeTierLabel}.</p>
        <p>
          <a href="${inviteUrl}" style="display:inline-block;padding:12px 24px;background-color:#1d4ed8;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600">Set up your account</a>
        </p>
        <p>If the button doesn't work, copy and paste this link into your browser:<br><a href="${inviteUrl}">${inviteUrl}</a></p>
        <p>If you've received this email more than once, only the link in the most recent one still works — earlier links are no longer valid.</p>
        <p>— The NASIHA Team</p>
      </div>`,
    });
    if (error) {
      console.error("[email] Failed to send welcome email", error);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (error) {
    console.error("[email] Failed to send welcome email", error);
    return { ok: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/**
 * Sent right after an anonymous visitor registers for an `open` event via
 * the public /events page. Best-effort, same as above: the EventRegistration
 * row is already persisted by the time this runs, so a failed/unconfigured
 * send must not surface as an error to the visitor. Unlike the public
 * listing itself (which never shows meetingUrl, per Event's schema
 * comment), this email does include it — registering is the visitor's one
 * deliberate signal of intent to attend, so withholding the join link past
 * that point serves no purpose. meetingUrl can still be null (a manually
 * entered event without one), hence the fallback line below. Also pitches
 * membership per PRD §4.6's stated purpose for EventRegistration: building
 * a list of engaged non-members for membership-campaign outreach.
 */
export async function sendEventRegistrationConfirmationEmail(
  to: string,
  name: string,
  event: { title: string; startsAt: Date; timezone: string | null; meetingUrl: string | null },
) {
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY not set — skipping event registration email to ${to}`);
    return;
  }

  const when = formatEventDateTime(event.startsAt, event.timezone);

  const joinLine = event.meetingUrl
    ? `Join with Google Meet: ${event.meetingUrl}`
    : "We'll share the joining details closer to the event.";

  const membershipPitch =
    "NASIHA is a free community of professionals, students, and teachers dedicated to reciprocal knowledge exchange — no fees, just knowledge. Members get full access to the Knowledge Library, Forums, and every live event like this one right on their calendar, plus the ability to connect directly with other members. If that sounds like you, membership is free to apply for: " +
    `${APP_URL}/join`;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: `You're registered: ${event.title}`,
      text: `Hi ${name},\n\nYou're registered for "${event.title}" on ${when}.\n\n${joinLine}\n\n${membershipPitch}\n\n— The NASIHA Team`,
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

/**
 * Sent to the recipient whenever a new inbox_message Notification is created
 * (§4.7) — a fresh top-level message or a reply on an existing thread.
 * Best-effort, same as every other function here: the InboxMessage +
 * Notification rows already exist by the time this runs.
 */
export async function sendInboxMessageEmail(
  to: string,
  name: string,
  message: { senderName: string; subject: string | null; snippet: string; threadUrl: string },
) {
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY not set — skipping inbox message email to ${to}`);
    return;
  }

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: message.subject ? `New message: ${message.subject}` : `New message from ${message.senderName}`,
      text: `Hi ${name},\n\n${message.senderName} sent you a message${
        message.subject ? ` — "${message.subject}"` : ""
      }:\n\n"${message.snippet}"\n\nReply here:\n${message.threadUrl}\n\n— The NASIHA Team`,
    });
  } catch (error) {
    console.error("[email] Failed to send inbox message email", error);
  }
}

/**
 * Sent to whichever party a meeting_request_received/accepted/declined/
 * rescheduled Notification targets (§4.7) — one shared shape since all four
 * events are a single line of context plus a link back to the thread, only
 * the subject/copy differs per call site. Best-effort, same as every other
 * function here: the MeetingRequest + Notification rows already exist by
 * the time this runs.
 */
export async function sendMeetingRequestEmail(
  to: string,
  name: string,
  request: { subject: string; message: string; link: string },
) {
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY not set — skipping meeting request email to ${to}`);
    return;
  }

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: request.subject,
      text: `Hi ${name},\n\n${request.message}\n\nView it here:\n${request.link}\n\n— The NASIHA Team`,
    });
  } catch (error) {
    console.error("[email] Failed to send meeting request email", error);
  }
}

/**
 * Sent to each invitee when an organizer restricts a new Event to a specific
 * list of members (Audience-Restricted Group Events initiative, Objective
 * 01) — always paired with an in-app event_invited Notification, same
 * two-channel pattern as sendMeetingRequestEmail. Copy deliberately names
 * the host and event and asks the recipient to RSVP rather than using
 * generic "you were invited" language — confirmed requirement, not a
 * stylistic choice. Best-effort, same rationale as every other function
 * here: the Event/EventInvitee/Notification rows already exist by the time
 * this runs.
 */
export async function sendEventInviteEmail(
  to: string,
  name: string,
  event: { hostName: string; title: string; startsAt: Date; timezone: string | null; link: string },
) {
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY not set — skipping event invite email to ${to}`);
    return;
  }

  const when = formatEventDateTime(event.startsAt, event.timezone);

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: `You're invited: ${event.title}`,
      text: `Hi ${name},\n\n${event.hostName} has requested your attendance at "${event.title}" on ${when}. Please RSVP.\n\nView details and RSVP here:\n${event.link}\n\n— The NASIHA Team`,
    });
  } catch (error) {
    console.error("[email] Failed to send event invite email", error);
  }
}

/**
 * Sent for a restricted event's post-creation lifecycle changes — removed
 * from the invited list, cancelled, or rescheduled (Audience-Restricted
 * Group Events, Objective 03) — one shared shape since all three are a
 * single line of context plus a link back to the event, only the
 * subject/copy differs per call site, same "one function per lifecycle
 * family" precedent as sendMeetingRequestEmail. Best-effort, same
 * rationale as every other function here: the Event/Notification rows
 * already exist by the time this runs.
 */
export async function sendEventLifecycleEmail(
  to: string,
  name: string,
  event: { subject: string; message: string; link?: string },
) {
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY not set — skipping event lifecycle email to ${to}`);
    return;
  }

  try {
    const viewLine = event.link ? `\n\nView it here:\n${event.link}` : "";
    await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: event.subject,
      text: `Hi ${name},\n\n${event.message}${viewLine}\n\n— The NASIHA Team`,
    });
  } catch (error) {
    console.error("[email] Failed to send event lifecycle email", error);
  }
}

/**
 * Sent to each invitee when a restricted Knowledge Library item becomes
 * visible to them — either because a Steward publishes an item they were
 * already invited to, or because they're added to an already-published
 * restricted item's invited list (Restricted Knowledge Library
 * Submissions, Objective 05) — mirrors sendEventInviteEmail's two-channel
 * pattern (always paired with an in-app library_item_shared Notification).
 * Best-effort, same rationale as every other function here: the
 * KnowledgeItem/KnowledgeItemInvitee/Notification rows already exist by
 * the time this runs.
 */
export async function sendLibraryInviteEmail(
  to: string,
  name: string,
  item: { contributorName: string; title: string; link: string },
) {
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY not set — skipping library invite email to ${to}`);
    return;
  }

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: `You now have access: ${item.title}`,
      text: `Hi ${name},\n\n${item.contributorName} has shared "${item.title}" in the Knowledge Library with you.\n\nView it here:\n${item.link}\n\n— The NASIHA Team`,
    });
  } catch (error) {
    console.error("[email] Failed to send library invite email", error);
  }
}

/**
 * Sent when a member is removed from a restricted Knowledge Library item's
 * invited list (Restricted Knowledge Library Submissions, Objective 05) —
 * mirrors sendEventLifecycleEmail's shared lifecycle shape. Best-effort,
 * same rationale as every other function here: the
 * KnowledgeItem/Notification rows already exist by the time this runs.
 */
export async function sendLibraryLifecycleEmail(
  to: string,
  name: string,
  item: { subject: string; message: string; link?: string },
) {
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY not set — skipping library lifecycle email to ${to}`);
    return;
  }

  try {
    const viewLine = item.link ? `\n\nView it here:\n${item.link}` : "";
    await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: item.subject,
      text: `Hi ${name},\n\n${item.message}${viewLine}\n\n— The NASIHA Team`,
    });
  } catch (error) {
    console.error("[email] Failed to send library lifecycle email", error);
  }
}

/**
 * Sent when a member is invited to review a Peer Review & Feedback item —
 * mirrors sendLibraryInviteEmail exactly (same "you now have access" shape),
 * fired alongside the paired in-app peer_review_invited notification.
 */
export async function sendReviewInviteEmail(
  to: string,
  name: string,
  item: { submitterName: string; title: string; link: string },
) {
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY not set — skipping review invite email to ${to}`);
    return;
  }

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: `You've been invited to review: ${item.title}`,
      text: `Hi ${name},\n\n${item.submitterName} has invited you to review "${item.title}" in Peer Review & Feedback.\n\nView it here:\n${item.link}\n\n— The NASIHA Team`,
    });
  } catch (error) {
    console.error("[email] Failed to send review invite email", error);
  }
}

/**
 * Sent when a member is removed from a ReviewItem's invited list, or when a
 * volunteer offer is declined — mirrors sendLibraryLifecycleEmail's shared
 * lifecycle shape.
 */
export async function sendReviewLifecycleEmail(to: string, name: string, item: { subject: string; message: string; link?: string }) {
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY not set — skipping review lifecycle email to ${to}`);
    return;
  }

  try {
    const viewLine = item.link ? `\n\nView it here:\n${item.link}` : "";
    await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: item.subject,
      text: `Hi ${name},\n\n${item.message}${viewLine}\n\n— The NASIHA Team`,
    });
  } catch (error) {
    console.error("[email] Failed to send review lifecycle email", error);
  }
}

export async function sendContactMessageEmail(message: {
  name: string;
  email: string;
  services: ContactService[];
  subject: string;
  message: string;
}) {
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY not set — skipping contact notification from ${message.email}`);
    return;
  }

  const servicesLine = message.services.length
    ? `Services: ${message.services.map((service) => CONTACT_SERVICE_LABELS[service]).join(", ")}\n`
    : "";

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: CONTACT_EMAIL,
      replyTo: message.email,
      subject: `[Contact form] ${message.subject}`,
      text: `From: ${message.name} <${message.email}>\n${servicesLine}\n${message.message}`,
    });
  } catch (error) {
    console.error("[email] Failed to send contact notification email", error);
  }
}

/**
 * An admin's one-way reply to a /contact submission (§4.15's admin audit
 * trail work — see lib/contact-server.ts's replyToContactMessage). Unlike
 * every other function in this file, this is NOT best-effort: sending IS
 * the action the admin took, so a failed/unconfigured send must throw and
 * surface as an error rather than being silently swallowed, which would
 * otherwise leave the message marked read and logged as replied with no
 * email ever having gone out. No inbound reply-to-this-address path exists
 * (the apex domain has no receiving/forwarding set up), hence the footer
 * pointing back to /contact for any follow-up.
 */
export async function sendContactMessageReplyEmail(to: string, originalSubject: string, body: string): Promise<void> {
  if (!resend) {
    throw new Error("RESEND_API_KEY not set — cannot send a reply email.");
  }

  const contactUrl = `${APP_URL}/contact`;
  const footer = `\n\n---\nThis is a one-way message — please do not reply to this email. If you have another question, use our Contact Us page:\n${contactUrl}`;

  await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `Re: ${originalSubject}`,
    text: `${body}${footer}`,
  });
}

/**
 * Fires whenever createMeetingCalendarEvent's Google Calendar API call fails
 * for an already-configured integration (see lib/google-calendar.ts) —
 * catches a dead/expired GOOGLE_CALENDAR_REFRESH_TOKEN (invalid_grant) within
 * minutes instead of only being discovered when a member notices a missing
 * Meet link days later, as happened before this alert existed. One email to
 * every admin rather than a per-admin loop — the recipient list is small and
 * internal, so seeing each other in `to` is expected. Best-effort like every
 * other function here: the caller already treats the underlying Google
 * failure as best-effort, so this alert must not throw on top of it.
 */
export async function sendCalendarIntegrationAlertEmail(
  admins: { email: string; name: string | null }[],
  details: { topic: string; errorMessage: string },
) {
  if (!resend || admins.length === 0) return;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: admins.map((admin) => admin.email),
      subject: "[NASIHA] URGENT — Admin action required: Google Meet link generation failed",
      text: `Auto-generating a Google Meet link failed for "${details.topic}".\n\nError: ${details.errorMessage}\n\nThis usually means GOOGLE_CALENDAR_REFRESH_TOKEN has expired or been revoked and needs to be re-issued (see web/scripts/get-google-refresh-token.ts). The event/meeting itself was still created successfully, just without a Meet link.`,
    });
  } catch (error) {
    console.error("[email] Failed to send calendar integration alert email", error);
  }
}
