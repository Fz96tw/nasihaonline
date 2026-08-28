import { Resend, type CreateEmailOptions, type CreateEmailResponse } from "resend";
import { db } from "@/lib/db";
import { Role, Tier, ContactService, DonationFrequency } from "@/lib/generated/prisma/enums";
import type { MembershipApplicationModel } from "@/lib/generated/prisma/models/MembershipApplication";
import type { DonationModel } from "@/lib/generated/prisma/models/Donation";
import { TIER_LABELS } from "@/lib/validation/application-review";
import { CONTACT_SERVICE_LABELS } from "@/lib/validation/contact";
import { HOW_HEARD_LABELS } from "@/lib/validation/application";
import { formatEventDateTime } from "@/lib/format-date";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "NASIHA <no-reply@mail.nasihaforyou.org>";
const CONTACT_EMAIL = process.env.CONTACT_INBOX_EMAIL ?? "info@nasihaforyou.org";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";

// Set only on the test.nasihaforyou.org deployment (homelab/.env) — the VPS
// deployment leaves this unset. Both share the same Clerk project and
// Resend sender, so without a flag a real member has no way to tell a
// test-triggered email from a real one.
const IS_TEST_ENVIRONMENT = process.env.IS_TEST_ENVIRONMENT === "true";

const TEST_BANNER_TEXT =
  "*** TEST ENVIRONMENT — sent from NASIHA's test system, not the live site. Do not act on this as a real member/donor communication. ***\n\n";
const TEST_BANNER_HTML =
  `<div style="background:#fef3c7;border:1px solid #f59e0b;color:#92400e;padding:12px 16px;margin-bottom:16px;border-radius:6px;font-family:sans-serif;font-size:14px;"><strong>TEST ENVIRONMENT</strong> — sent from NASIHA's test system, not the live site. Do not act on this as a real member/donor communication.</div>`;

function extractAddress(recipient: string): string {
  // Resend accepts either a bare address or "Name <email@domain>".
  return (recipient.match(/<(.+)>/)?.[1] ?? recipient).toLowerCase();
}

/**
 * test.nasihaforyou.org is only ever used by admins, but shares its Clerk
 * project/DB shape with real members — a test action (e.g. approving a
 * test application) would otherwise still email the real person. Anyone
 * not resolving to an admin User row (including addresses with no User row
 * at all, like an unregistered applicant) is treated as non-admin.
 */
async function allRecipientsAreAdmins(to: CreateEmailOptions["to"]): Promise<boolean> {
  const addresses = (Array.isArray(to) ? to : [to]).map(extractAddress);
  const admins = await db.user.findMany({
    where: { email: { in: addresses }, role: Role.admin },
    select: { email: true },
  });
  const adminAddresses = new Set(admins.map((admin) => admin.email.toLowerCase()));
  return addresses.every((address) => adminAddresses.has(address));
}

/**
 * Every outbound email goes through here instead of resend.emails.send
 * directly, so IS_TEST_ENVIRONMENT can flag/gate the message without
 * threading the check through each send function below. Callers already
 * guard on `resend` being non-null before calling this.
 */
async function sendEmail(params: CreateEmailOptions): Promise<CreateEmailResponse> {
  if (!IS_TEST_ENVIRONMENT) return resend!.emails.send(params);

  if (!(await allRecipientsAreAdmins(params.to))) {
    console.warn(
      `[email] IS_TEST_ENVIRONMENT — skipping send to non-admin recipient(s): ${JSON.stringify(params.to)}`,
    );
    return { data: { id: "skipped-non-admin-test-recipient" }, error: null, headers: null };
  }

  return resend!.emails.send({
    ...params,
    subject: `[TEST] ${params.subject}`,
    text: params.text ? TEST_BANNER_TEXT + params.text : params.text,
    html: params.html ? TEST_BANNER_HTML + params.html : params.html,
  } as CreateEmailOptions);
}

/**
 * Best-effort: a failed/unconfigured email send must not fail application
 * submission, since the MembershipApplication record is already persisted
 * by the time this runs. Logs instead of throwing.
 */
function formatApplicationSummary(application: MembershipApplicationModel): string {
  const lines: Array<[string, string]> = [
    ["Name", `${application.firstName} ${application.lastName}`],
    ["Email", application.email],
    ["Professional title / occupation", application.professionalTitle || ""],
    ["LinkedIn", application.linkedinUrl || ""],
    ["Requested tier", application.requestedTier ? TIER_LABELS[application.requestedTier] : ""],
    ["Country / region", application.countryRegion],
    [
      "How did you hear about NASIHA?",
      application.howHeardSource
        ? [HOW_HEARD_LABELS[application.howHeardSource], application.howHeardMemberName, application.howHeardOtherDetail]
            .filter(Boolean)
            .join(" — ")
        : "",
    ],
    ["Email updates opt-in", application.emailUpdatesOptIn ? "Yes" : "No"],
  ];

  // sourcedFromDonation applications (lib/friend-application.ts) never
  // collect most of these fields, so a blank line for each would just be
  // noise in that donor's copy — skipped here rather than shown as "—".
  return lines
    .filter(([, value]) => value.trim() !== "")
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n");
}

export async function sendApplicationConfirmationEmail(application: MembershipApplicationModel) {
  const to = application.email;
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY not set — skipping confirmation email to ${to}`);
    return;
  }

  const intro = application.sourcedFromDonation
    ? "Thank you for your donation to NASIHA. Because you checked \"Also apply to become a Friend of NASIHA,\" that membership application was submitted automatically along with it."
    : "Thank you for applying to NASIHA.";

  try {
    await sendEmail({
      from: FROM_EMAIL,
      to,
      subject: "Your NASIHA membership application was received",
      text: `Hi ${application.firstName},\n\n${intro} The Board will review your application and be in touch within 7 days.\n\n— The NASIHA Team\n\n---\nA copy of your submitted application:\n\n${formatApplicationSummary(application)}`,
    });
  } catch (error) {
    console.error("[email] Failed to send application confirmation email", error);
  }
}

/**
 * Sent by the Stripe webhook right after a Donation row is created
 * (app/api/webhooks/stripe/route.ts) — the donor's only receipt that a
 * *donation*, specifically, went through. Separate from (and sent in
 * addition to, when applicable) sendApplicationConfirmationEmail: a donor
 * who also checks "Also apply to become a Friend of NASIHA" is doing two
 * distinct things in one click (PRD §4.14) and should get a confirmation
 * for each, since neither email mentions the other action.
 */
function formatDonationAmount(donation: DonationModel): string {
  return (donation.amountCents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: donation.currency.toUpperCase(),
  });
}

export async function sendDonationConfirmationEmail(donation: DonationModel) {
  const to = donation.donorEmail;
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY not set — skipping donation confirmation email to ${to}`);
    return;
  }

  const amount = formatDonationAmount(donation);
  const cadence = donation.frequency === DonationFrequency.recurring ? "monthly, recurring" : "one-time";

  try {
    await sendEmail({
      from: FROM_EMAIL,
      to,
      subject: "Thank you for your donation to NASIHA",
      text: `Hi ${donation.donorName},\n\nThank you for your ${cadence} donation of ${amount} to NASIHA. Donations fund the day-to-day costs of keeping NASIHA free and open to every member — hosting and platform infrastructure, live events, and community programs like mentorship, peer review, and outreach to bring in new contributors. We maintain transparent financial records and operate within a budget approved by our Board of Directors, so every gift goes directly toward strengthening the community.\n\nNASIHA is a registered 501(c)(3) nonprofit organization, and your donation is tax-deductible to the fullest extent allowed by law. You'll receive a receipt from Stripe for your records.${donation.note ? `\n\nYour note: "${donation.note}"` : ""}\n\n— The NASIHA Team`,
    });
  } catch (error) {
    console.error("[email] Failed to send donation confirmation email", error);
  }
}

/**
 * Fires for every successful donation charge — including each month of a
 * recurring subscription, not just first-time donors — so the treasurer
 * has real-time visibility instead of relying on someone checking
 * /admin/donations. One email to every admin, same pattern as
 * sendCalendarIntegrationAlertEmail.
 */
export async function sendDonationAdminAlertEmail(
  admins: { email: string; name: string | null }[],
  donation: DonationModel,
) {
  if (!resend || admins.length === 0) return;

  const amount = formatDonationAmount(donation);
  const cadence = donation.frequency === DonationFrequency.recurring ? "Recurring (monthly)" : "One-time";
  const donationsUrl = `${APP_URL}/admin/donations`;

  try {
    await sendEmail({
      from: FROM_EMAIL,
      to: admins.map((admin) => admin.email),
      subject: `[NASIHA] New donation received — ${amount}`,
      text: `${donation.donorName} <${donation.donorEmail}> just donated ${amount} (${cadence}).\n\nPublic recognition consent: ${donation.recognitionConsent ? "Yes" : "No"}${donation.note ? `\nNote: "${donation.note}"` : ""}\n\nView all donations: ${donationsUrl}`,
    });
  } catch (error) {
    console.error("[email] Failed to send donation admin alert email", error);
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
    const { error } = await sendEmail({
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
 * a list of engaged non-members for membership-campaign outreach. Carries
 * a `.ics` attachment (built by the caller via buildEventIcs), same
 * calendar-invite treatment as sendRsvpConfirmationEmail's member-facing
 * counterpart — a registered guest gets the event on their own calendar
 * too, not just the in-app link.
 */
export async function sendEventRegistrationConfirmationEmail(
  to: string,
  name: string,
  event: {
    id: string;
    registrationId: string;
    title: string;
    startsAt: Date;
    timezone: string | null;
    meetingUrl: string | null;
    livekitRoomName: string | null;
    icsContent: string;
    icsFilename: string;
  },
) {
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY not set — skipping event registration email to ${to}`);
    return;
  }

  const when = formatEventDateTime(event.startsAt, event.timezone);

  // Links to the in-app waiting-room page rather than the raw meeting URL
  // (meeting-join-experience) — same underlying access (open events stay
  // unauthenticated-readable there), but now with a countdown/host-message
  // instead of dropping straight into the video call's own lobby. The
  // waiting-room page itself resolves Google Meet vs Nasiha Conference
  // (LiveKit), so this line stays platform-agnostic rather than naming one.
  // Checks both meetingUrl and livekitRoomName (not meetingUrl alone) —
  // the attached .ics's own LOCATION field (buildEventIcs) already resolves
  // a join link the same way, so a LiveKit-backed event's link showing up
  // there while this text still said "we'll share details later" would be
  // a contradiction the recipient could actually see.
  // `?rid=` is now required, not just a display nicety — getEventMeetingStatus
  // rejects an anonymous caller without a valid one (registration-required
  // anonymous join). It also resolves this guest's registered name/email
  // into the meeting display instead of a bare "Guest".
  const joinUrl = event.meetingUrl || event.livekitRoomName
    ? `${APP_URL}/meet/event/${event.id}?rid=${encodeURIComponent(event.registrationId)}`
    : null;
  const joinLine = joinUrl
    ? `Use this link to join the meeting at the scheduled time:\n${joinUrl}`
    : "We'll share the joining details closer to the event.";

  const membershipPitch =
    "NASIHA is a free community of professionals, students, and teachers dedicated to reciprocal knowledge exchange — no fees, just knowledge. Members get full access to the Knowledge Library, Forums, and every live event like this one right on their calendar, plus the ability to connect directly with other members. If that sounds like you, membership is free to apply for: " +
    `${APP_URL}/join`;

  try {
    await sendEmail({
      from: FROM_EMAIL,
      to,
      subject: `You're registered: ${event.title}`,
      text: `Hi ${name},\n\nYou're registered for "${event.title}" on ${when}. We've attached a calendar invite so it's on your calendar.\n\n${joinLine}\n\n${membershipPitch}\n\n— The NASIHA Team`,
      attachments: [
        {
          filename: event.icsFilename,
          content: Buffer.from(event.icsContent, "utf-8"),
          contentType: "text/calendar",
        },
      ],
    });
  } catch (error) {
    console.error("[email] Failed to send event registration confirmation email", error);
  }
}

/**
 * Sent to every anonymous (non-member) EventRegistration guest when the
 * host/admin resends notifications for an `open`, community-visibility
 * event (lib/events-server.ts's resendEventNotifications) — the guest
 * counterpart to sendEventAnnouncementEmail's member-facing reminder.
 * Guests have no User account and thus no bell notification, so this is
 * their only reminder channel; no membership pitch here (unlike the
 * registration-confirmation email above) since a reminder isn't the moment
 * for that pitch.
 *
 * Carries the same meetingUrl/livekitRoomName-aware join link as
 * sendEventRegistrationConfirmationEmail, resolved fresh at send time
 * rather than reusing whatever link (if any) was live when the guest first
 * registered — this is the only channel that ever hands a guest a join
 * link at all (the public /events/[id] page this email's `link` points to
 * deliberately never exposes meetingUrl, see getPublicEventById), so a
 * resend fired after the organizer adds/changes the link is how a guest
 * who registered before that actually finds out. Best-effort, same
 * rationale as every other function here.
 */
export async function sendEventRegistrationReminderEmail(
  to: string,
  name: string,
  event: {
    id: string;
    registrationId: string;
    title: string;
    description: string | null;
    startsAt: Date;
    timezone: string | null;
    meetingUrl: string | null;
    livekitRoomName: string | null;
    link: string;
  },
) {
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY not set — skipping event registration reminder email to ${to}`);
    return;
  }

  const when = formatEventDateTime(event.startsAt, event.timezone);
  const description = event.description?.trim() || null;
  const safeDescription = description ? escapeHtml(description).replace(/\n/g, "<br>") : "";
  // `?rid=` — same guest-identity linkage as sendEventRegistrationConfirmationEmail above.
  const joinUrl = event.meetingUrl || event.livekitRoomName
    ? `${APP_URL}/meet/event/${event.id}?rid=${encodeURIComponent(event.registrationId)}`
    : null;
  const joinLine = joinUrl
    ? `Use this link to join the meeting at the scheduled time:\n${joinUrl}`
    : "We'll share the joining details closer to the event.";

  try {
    await sendEmail({
      from: FROM_EMAIL,
      to,
      subject: `Reminder: ${event.title}`,
      text: `Hi ${name},\n\nJust a reminder that you're registered for "${event.title}" on ${when}.${
        description ? `\n\n${description}` : ""
      }\n\n${joinLine}\n\nEvent details: ${event.link}\n\n— The NASIHA Team`,
      html: `<div><h1>${escapeHtml(event.title)}</h1><p>Just a reminder that you're registered for this event on ${escapeHtml(when)}.</p>${
        safeDescription ? `<p>${safeDescription}</p>` : ""
      }<p>${joinUrl ? `Use this link to join the meeting at the scheduled time: <a href="${joinUrl}">${joinUrl}</a>` : escapeHtml(joinLine)}</p><p><a href="${event.link}">Event details</a></p></div>`,
    });
  } catch (error) {
    console.error("[email] Failed to send event registration reminder email", error);
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
    await sendEmail({
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
    await sendEmail({
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
    await sendEmail({
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
    await sendEmail({
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
    await sendEmail({
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
 * Sent to every member when a host schedules a new community-visibility
 * (public) event — the all-members broadcast counterpart to
 * sendEventInviteEmail's targeted "you were invited" copy, always paired
 * with an in-app event_published Notification. Best-effort, same rationale
 * as every other function here: the Event/Notification rows already exist
 * by the time this runs. `isReminder` swaps the "scheduled a new event"
 * copy for reminder copy — set only by a manual "Resend Notifications"
 * click (lib/events-server.ts's resendEventNotifications), never by the
 * automatic send at creation time.
 */
export async function sendEventAnnouncementEmail(
  to: string,
  name: string,
  event: {
    hostName: string;
    title: string;
    description: string | null;
    startsAt: Date;
    timezone: string | null;
    link: string;
    isReminder?: boolean;
  },
) {
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY not set — skipping event announcement email to ${to}`);
    return;
  }

  const when = formatEventDateTime(event.startsAt, event.timezone);
  const description = event.description?.trim() || null;
  const safeDescription = description ? escapeHtml(description).replace(/\n/g, "<br>") : "";
  const introText = event.isReminder
    ? `${event.hostName} wanted to remind you about an upcoming event: "${event.title}" on ${when}.`
    : `${event.hostName} scheduled a new event: "${event.title}" on ${when}.`;

  try {
    await sendEmail({
      from: FROM_EMAIL,
      to,
      subject: `${event.isReminder ? "Reminder" : "New event"}: ${event.title}`,
      text: `Hi ${name},\n\n${introText}${
        description ? `\n\n${description}` : ""
      }\n\nView details here:\n${event.link}\n\n— The NASIHA Team`,
      html: `<div><h1>${escapeHtml(event.title)}</h1><p>${escapeHtml(introText)}</p>${
        safeDescription ? `<p>${safeDescription}</p>` : ""
      }<p><a href="${event.link}">View details</a></p></div>`,
    });
  } catch (error) {
    console.error("[email] Failed to send event announcement email", error);
  }
}

/**
 * Sent to a member right after they RSVP `going` to an event (§4.6) —
 * the calendar-invite counterpart to sendEventRegistrationConfirmationEmail's
 * anonymous-visitor flow. Carries a `.ics` attachment (built by the caller
 * via buildEventIcs, same hand-rolled generator the /api/events/:id/ics
 * download route uses) so the event lands on the member's own calendar
 * app, not just NASIHA's. Only fired on `going`, never on cancelling back
 * out of an RSVP — see rsvpToEvent. Best-effort, same rationale as every
 * other function here: the RSVP row already exists by the time this runs.
 */
export async function sendRsvpConfirmationEmail(
  to: string,
  name: string,
  event: {
    id: string;
    title: string;
    startsAt: Date;
    timezone: string | null;
    meetingUrl: string | null;
    livekitRoomName: string | null;
    link: string;
    icsContent: string;
    icsFilename: string;
  },
) {
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY not set — skipping RSVP confirmation email to ${to}`);
    return;
  }

  const when = formatEventDateTime(event.startsAt, event.timezone);
  // Links to the in-app waiting-room page, same platform-agnostic
  // convention as sendEventRegistrationConfirmationEmail — resolves Google
  // Meet vs Nasiha Conference (LiveKit) itself, and previously linking
  // straight to event.meetingUrl silently dropped the join line entirely
  // for LiveKit events (meetingUrl is only ever set on the Google Meet path).
  const joinLine = (event.meetingUrl || event.livekitRoomName)
    ? `Join the event: ${APP_URL}/meet/event/${event.id}`
    : "We'll share the joining details closer to the event.";

  try {
    await sendEmail({
      from: FROM_EMAIL,
      to,
      subject: `You're going: ${event.title}`,
      text: `Hi ${name},\n\nYou're confirmed for "${event.title}" on ${when}. We've attached a calendar invite so it's on your calendar.\n\n${joinLine}\n\nView details here:\n${event.link}\n\n— The NASIHA Team`,
      attachments: [
        {
          filename: event.icsFilename,
          content: Buffer.from(event.icsContent, "utf-8"),
          contentType: "text/calendar",
        },
      ],
    });
  } catch (error) {
    console.error("[email] Failed to send RSVP confirmation email", error);
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
    await sendEmail({
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
    await sendEmail({
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
    await sendEmail({
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
    await sendEmail({
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
    await sendEmail({
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
    await sendEmail({
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

  await sendEmail({
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
    await sendEmail({
      from: FROM_EMAIL,
      to: admins.map((admin) => admin.email),
      subject: "[NASIHA] URGENT — Admin action required: Google Meet link generation failed",
      text: `Auto-generating a Google Meet link failed for "${details.topic}".\n\nError: ${details.errorMessage}\n\nThis usually means GOOGLE_CALENDAR_REFRESH_TOKEN has expired or been revoked and needs to be re-issued (see web/scripts/get-google-refresh-token.ts). The event/meeting itself was still created successfully, just without a Meet link.`,
    });
  } catch (error) {
    console.error("[email] Failed to send calendar integration alert email", error);
  }
}
