// No "server-only" guard: imported directly by scripts/worker.ts (the
// survey open/auto-close delayed jobs), which runs outside Next's server
// runtime — same split as lib/search-index-sync.ts vs
// lib/announcements-server.ts.
import { db } from "@/lib/db";
import { Role, SurveyStatus, NotificationType } from "@/lib/generated/prisma/enums";
import { sendSurveyInviteEmail } from "@/lib/email";
import { enqueueAutoClose } from "@/lib/queues/survey-queue";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";

export type ResolvedSurveyRecipient = {
  email: string;
  name: string | null;
  userId: string | null;
  source: "member" | "donor" | "event_registrant";
};

/**
 * Unions the three audience sources into one deduped recipient list,
 * generalizing getEventEngagementForAdmin()'s registration+RSVP union
 * (lib/events-server.ts) to a third source (Donation). Dedup priority is
 * member > donor > event_registrant, so someone who's both a member and a
 * past donor is recorded with their userId (member wins). Donors are
 * filtered to emailUpdatesOptIn — the flag exists specifically for this
 * kind of outreach. Called once, at the moment a survey first opens — the
 * resulting SurveyInvitation rows are a snapshot, not re-evaluated as
 * tiers/donations/registrations change later while the survey is live.
 */
export async function resolveSurveyAudience(survey: {
  audienceMembers: boolean;
  audienceDonors: boolean;
  audienceEventRegistrants: boolean;
}): Promise<ResolvedSurveyRecipient[]> {
  const byEmail = new Map<string, ResolvedSurveyRecipient>();

  if (survey.audienceMembers) {
    const members = await db.user.findMany({
      where: { role: { in: [Role.member, Role.moderator, Role.admin] }, tier: { not: null } },
      select: { id: true, email: true, name: true },
    });
    for (const member of members) {
      byEmail.set(member.email.toLowerCase(), {
        email: member.email,
        name: member.name,
        userId: member.id,
        source: "member",
      });
    }
  }

  if (survey.audienceDonors) {
    const donors = await db.donation.findMany({
      where: { emailUpdatesOptIn: true },
      select: { donorEmail: true, donorName: true },
    });
    for (const donor of donors) {
      const key = donor.donorEmail.toLowerCase();
      if (!byEmail.has(key)) {
        byEmail.set(key, { email: donor.donorEmail, name: donor.donorName, userId: null, source: "donor" });
      }
    }
  }

  if (survey.audienceEventRegistrants) {
    const registrants = await db.eventRegistration.findMany({ select: { email: true, name: true } });
    for (const registrant of registrants) {
      const key = registrant.email.toLowerCase();
      if (!byEmail.has(key)) {
        byEmail.set(key, {
          email: registrant.email,
          name: registrant.name,
          userId: null,
          source: "event_registrant",
        });
      }
    }
  }

  return Array.from(byEmail.values());
}

/**
 * Materializes SurveyInvitation rows for the resolved audience and fans out
 * the invite (email to everyone via a tokenized magic link, plus an in-app
 * Notification for member-sourced invitations) — the one-time transition
 * into `open`. Idempotent no-op if the survey is already open/closed, so
 * the immediate-send path (surveys-server.ts) and a delayed open-survey job
 * (scripts/worker.ts) can never double-send. Never touches invitations on
 * reopen (see reopenSurvey in surveys-server.ts) — the audience is locked
 * in at first open, same "snapshot, not live" rationale as
 * resolveSurveyAudience.
 */
export async function openSurveyNow(surveyId: string): Promise<void> {
  const survey = await db.survey.findUnique({ where: { id: surveyId } });
  if (!survey || survey.status === SurveyStatus.open || survey.status === SurveyStatus.closed) return;

  const recipients = await resolveSurveyAudience(survey);
  const generation = survey.generation + 1;

  if (recipients.length > 0) {
    await db.surveyInvitation.createMany({
      data: recipients.map((recipient) => ({
        surveyId,
        email: recipient.email,
        name: recipient.name,
        userId: recipient.userId,
        source: recipient.source,
        token: crypto.randomUUID(),
        sentAt: new Date(),
      })),
      skipDuplicates: true,
    });
  }

  await db.survey.update({
    where: { id: surveyId },
    data: { status: SurveyStatus.open, openedAt: new Date(), generation },
  });

  const invitations = await db.surveyInvitation.findMany({
    where: { surveyId },
    select: { email: true, token: true, userId: true },
  });

  // Inlined rather than imported from lib/storage's getSurveyHeroImageUrl —
  // that module has an `import "server-only"` guard, and this file (unlike
  // lib/surveys-server.ts) is imported directly by scripts/worker.ts, which
  // runs outside Next's server runtime.
  const heroImageUrl = survey.heroImageUrl ? `${APP_URL}/api/surveys/hero/${survey.heroImageUrl}` : null;

  // Best-effort per recipient, same rationale as every email in
  // lib/email.ts — the Survey + SurveyInvitation rows already exist by this
  // point, so a failed/unconfigured send must not undo the open.
  await Promise.allSettled(
    invitations.map((invitation) =>
      sendSurveyInviteEmail(invitation.email, {
        title: survey.title,
        description: survey.description,
        heroImageUrl,
        respondUrl: `${APP_URL}/surveys/respond/${invitation.token}`,
      }),
    ),
  );

  const memberInvitations = invitations.filter((invitation) => invitation.userId);
  if (memberInvitations.length > 0) {
    await db.notification.createMany({
      data: memberInvitations.map((invitation) => ({
        recipientId: invitation.userId as string,
        type: NotificationType.survey_invitation,
        message: `New survey: "${survey.title}"`,
        link: `/surveys/respond/${invitation.token}`,
      })),
    });
  }

  if (survey.durationDays) {
    await enqueueAutoClose(surveyId, generation, new Date(Date.now() + survey.durationDays * 24 * 60 * 60 * 1000));
  }
}

/**
 * Handler for the delayed "auto-close" job (lib/queues/survey-queue.ts).
 * The updateMany's where clause is the guard: status=open AND a matching
 * generation, so this is a no-op if the admin already manually closed the
 * survey, or if they closed-and-reopened (bumping generation) since this
 * job was queued — a stale job from before a reopen must never close a
 * survey the admin just reopened.
 */
export async function autoCloseSurveyIfDue(surveyId: string, generation: number): Promise<void> {
  await db.survey.updateMany({
    where: { id: surveyId, status: SurveyStatus.open, generation },
    data: { status: SurveyStatus.closed, closedAt: new Date() },
  });
}
