import "server-only";
import { db } from "@/lib/db";
import { SurveyStatus, type SurveyQuestionType } from "@/lib/generated/prisma/enums";
import { openSurveyNow } from "@/lib/surveys-lifecycle";
import { enqueueOpenSurvey, enqueueAutoClose } from "@/lib/queues/survey-queue";
import { uploadSurveyHeroImage, getSurveyHeroImageUrl } from "@/lib/storage";

export class SurveyError extends Error {
  constructor(
    public readonly status: 400 | 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

export type SurveyQuestionInput = {
  prompt: string;
  type: SurveyQuestionType;
  required: boolean;
  options: string[];
};

export type SurveyComposeInput = {
  title: string;
  description: string;
  questions: SurveyQuestionInput[];
  audienceMembers: boolean;
  audienceDonors: boolean;
  audienceEventRegistrants: boolean;
  scheduledStartAt: string | null;
  durationDays: number | null;
  action: "draft" | "send";
};

function questionsData(questions: SurveyQuestionInput[]) {
  return questions.map((question, index) => ({
    order: index,
    prompt: question.prompt,
    type: question.type,
    required: question.required,
    options: question.options,
  }));
}

function parseScheduledStartAt(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new SurveyError(400, "Start date isn't valid.");
  return parsed;
}

/**
 * Creates a new draft Survey row. "Use as template" resends always call
 * this (never PATCH) so the source survey's history entry stays untouched
 * — same convention as Announcement's fromId resend. If `action` is
 * "send", immediately transitions the newly-created draft via
 * scheduleOrSendSurvey once it exists.
 *
 * `templateHeroImageUrl` supports "use as template" resends: when the admin
 * didn't pick a new file, the new Survey reuses a prior survey's
 * already-uploaded MinIO object key instead of requiring a re-upload — same
 * rationale as createAndSendAnnouncement's identical parameter. A new
 * `heroImage` file always takes priority over it.
 */
export async function createSurvey(
  authorId: string,
  input: SurveyComposeInput,
  hero: { heroImage: File | null; templateHeroImageUrl?: string | null },
): Promise<{ id: string }> {
  const scheduledStartAt = parseScheduledStartAt(input.scheduledStartAt);

  let heroImageUrl: string | null = hero.templateHeroImageUrl ?? null;
  if (hero.heroImage) {
    heroImageUrl = await uploadSurveyHeroImage(hero.heroImage);
  }

  const survey = await db.survey.create({
    data: {
      title: input.title,
      description: input.description || null,
      authorId,
      heroImageUrl,
      audienceMembers: input.audienceMembers,
      audienceDonors: input.audienceDonors,
      audienceEventRegistrants: input.audienceEventRegistrants,
      scheduledStartAt,
      durationDays: input.durationDays,
      questions: { create: questionsData(input.questions) },
    },
    select: { id: true },
  });

  if (input.action === "send") {
    await scheduleOrSendSurvey(survey.id);
  }

  return survey;
}

/**
 * Edits an existing survey in place — only ever legal while still `draft`.
 * Unlike a sent Announcement (which can never be mutated, only retracted),
 * a draft Survey hasn't gone out to anyone yet, so replacing its questions
 * wholesale (delete + recreate, simplest way to handle reordering/removal)
 * is safe. If `action` is "send", transitions this same row out of draft
 * once the edit is saved — that's still a pre-send mutation, not "editing a
 * sent record".
 *
 * `heroImage` is optional here (unlike createSurvey, there's no
 * `templateHeroImageUrl` fallback to resolve) — when omitted, `heroImageUrl`
 * is left out of the update data entirely (Prisma treats an `undefined`
 * field as "not provided," not "set to null"), so the survey's existing
 * cover image carries over untouched. Passing a new file replaces it.
 */
export async function updateDraftSurvey(
  surveyId: string,
  input: SurveyComposeInput,
  hero: { heroImage: File | null },
): Promise<{ id: string }> {
  const existing = await db.survey.findUnique({ where: { id: surveyId }, select: { status: true } });
  if (!existing) throw new SurveyError(404, "Survey not found.");
  if (existing.status !== SurveyStatus.draft) throw new SurveyError(409, "Only draft surveys can be edited.");

  const scheduledStartAt = parseScheduledStartAt(input.scheduledStartAt);
  const heroImageUrl = hero.heroImage ? await uploadSurveyHeroImage(hero.heroImage) : undefined;

  await db.$transaction([
    db.surveyQuestion.deleteMany({ where: { surveyId } }),
    db.survey.update({
      where: { id: surveyId },
      data: {
        title: input.title,
        description: input.description || null,
        heroImageUrl,
        audienceMembers: input.audienceMembers,
        audienceDonors: input.audienceDonors,
        audienceEventRegistrants: input.audienceEventRegistrants,
        scheduledStartAt,
        durationDays: input.durationDays,
        questions: { create: questionsData(input.questions) },
      },
    }),
  ]);

  if (input.action === "send") {
    await scheduleOrSendSurvey(surveyId);
  }

  return { id: surveyId };
}

/**
 * Transitions a draft survey out of draft: straight to `open` (no
 * scheduledStartAt, or one already in the past — sends immediately via
 * lib/surveys-lifecycle's openSurveyNow) or to `scheduled` (a future
 * scheduledStartAt — enqueues the delayed open-survey job that calls the
 * same openSurveyNow later, from the worker).
 */
export async function scheduleOrSendSurvey(surveyId: string): Promise<void> {
  const survey = await db.survey.findUnique({ where: { id: surveyId } });
  if (!survey) throw new SurveyError(404, "Survey not found.");
  if (survey.status !== SurveyStatus.draft) throw new SurveyError(409, "This survey has already been sent.");

  if (survey.scheduledStartAt && survey.scheduledStartAt.getTime() > Date.now()) {
    await db.survey.update({ where: { id: surveyId }, data: { status: SurveyStatus.scheduled } });
    await enqueueOpenSurvey(surveyId, survey.generation, survey.scheduledStartAt);
    return;
  }

  await openSurveyNow(surveyId);
}

/**
 * Manual close (admin, any time while open). Idempotent-safe: if the
 * delayed auto-close job fires after this, its generation-guarded
 * updateMany (autoCloseSurveyIfDue) is already a no-op against a row
 * that's no longer `open`.
 */
export async function closeSurvey(surveyId: string, closedById: string): Promise<void> {
  const survey = await db.survey.findUnique({ where: { id: surveyId }, select: { status: true } });
  if (!survey) throw new SurveyError(404, "Survey not found.");
  if (survey.status !== SurveyStatus.open) throw new SurveyError(409, "Only an open survey can be closed.");

  await db.survey.update({
    where: { id: surveyId },
    data: { status: SurveyStatus.closed, closedAt: new Date(), closedById },
  });
}

/**
 * Manual reopen (admin, while closed). Never re-resolves the audience or
 * re-sends invitations — the recipient list stays locked in from the first
 * open (lib/surveys-lifecycle.ts). Bumps `generation` so a stale delayed
 * auto-close job queued before this reopen is guaranteed to no-op. A new
 * `durationDays` (or null to leave it open indefinitely) schedules a fresh
 * auto-close from now.
 */
export async function reopenSurvey(surveyId: string, durationDays: number | null): Promise<void> {
  const survey = await db.survey.findUnique({
    where: { id: surveyId },
    select: { status: true, generation: true },
  });
  if (!survey) throw new SurveyError(404, "Survey not found.");
  if (survey.status !== SurveyStatus.closed) throw new SurveyError(409, "Only a closed survey can be reopened.");

  const generation = survey.generation + 1;
  await db.survey.update({
    where: { id: surveyId },
    data: {
      status: SurveyStatus.open,
      closedAt: null,
      closedById: null,
      generation,
      durationDays,
    },
  });

  if (durationDays) {
    await enqueueAutoClose(surveyId, generation, new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000));
  }
}

export type SurveyDetail = {
  id: string;
  title: string;
  description: string | null;
  status: SurveyStatus;
  heroImageUrl: string | null;
  audienceMembers: boolean;
  audienceDonors: boolean;
  audienceEventRegistrants: boolean;
  scheduledStartAt: string | null;
  durationDays: number | null;
  questions: SurveyQuestionInput[];
};

/**
 * Full compose-shape detail for a survey — used both to pre-fill "use as
 * template" (?fromId=<id> on /admin/surveys/new, any past status) and to
 * pre-fill in-place editing of a still-draft survey (/admin/surveys/[id]/edit,
 * page-side status check). `heroImageUrl` is the raw MinIO object key here
 * (not a display URL) — same convention as getAnnouncementTemplate; callers
 * resolve it via getSurveyHeroImageUrl() when they need to render it.
 * Returns null for a missing id, same graceful-fallback shape as
 * getAnnouncementTemplate.
 */
export async function getSurveyDetail(id: string): Promise<SurveyDetail | null> {
  const survey = await db.survey.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      heroImageUrl: true,
      audienceMembers: true,
      audienceDonors: true,
      audienceEventRegistrants: true,
      scheduledStartAt: true,
      durationDays: true,
      questions: {
        orderBy: { order: "asc" },
        select: { prompt: true, type: true, required: true, options: true },
      },
    },
  });
  if (!survey) return null;

  return { ...survey, scheduledStartAt: survey.scheduledStartAt?.toISOString() ?? null };
}

export type SurveyHistoryItem = {
  id: string;
  title: string;
  status: SurveyStatus;
  authorName: string;
  audienceSummary: string[];
  createdAt: string;
  scheduledStartAt: string | null;
  openedAt: string | null;
  closedAt: string | null;
  sentCount: number;
  respondedCount: number;
};

/**
 * All past/current surveys (drafts included) for the admin history list —
 * unlike listAnnouncementHistory, which only shows sent announcements,
 * drafts are a real, resumable state here so they belong in the list too.
 */
export async function listSurveyHistory(): Promise<SurveyHistoryItem[]> {
  const surveys = await db.survey.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      status: true,
      author: { select: { name: true } },
      audienceMembers: true,
      audienceDonors: true,
      audienceEventRegistrants: true,
      createdAt: true,
      scheduledStartAt: true,
      openedAt: true,
      closedAt: true,
      _count: { select: { invitations: true, responses: true } },
    },
  });

  return surveys.map((survey) => ({
    id: survey.id,
    title: survey.title,
    status: survey.status,
    authorName: survey.author.name ?? "NASIHA Admin",
    audienceSummary: [
      survey.audienceMembers ? "Members" : null,
      survey.audienceDonors ? "Donors" : null,
      survey.audienceEventRegistrants ? "Event Registrants" : null,
    ].filter((label): label is string => Boolean(label)),
    createdAt: survey.createdAt.toISOString(),
    scheduledStartAt: survey.scheduledStartAt?.toISOString() ?? null,
    openedAt: survey.openedAt?.toISOString() ?? null,
    closedAt: survey.closedAt?.toISOString() ?? null,
    sentCount: survey._count.invitations,
    respondedCount: survey._count.responses,
  }));
}

export type SurveyResponsesData = {
  survey: { id: string; title: string; status: SurveyStatus; sentCount: number };
  questions: { id: string; prompt: string; type: SurveyQuestionType; options: string[] }[];
  rows: {
    respondentName: string | null;
    respondentEmail: string;
    submittedAt: string;
    answers: Record<string, string[]>;
  }[];
};

/** Response viewer + CSV export data — per-question definitions plus one row per respondent. */
export async function getSurveyResponses(surveyId: string): Promise<SurveyResponsesData | null> {
  const survey = await db.survey.findUnique({
    where: { id: surveyId },
    select: {
      id: true,
      title: true,
      status: true,
      questions: { orderBy: { order: "asc" }, select: { id: true, prompt: true, type: true, options: true } },
      responses: {
        orderBy: { submittedAt: "desc" },
        select: {
          submittedAt: true,
          invitation: { select: { name: true, email: true } },
          answers: { select: { questionId: true, value: true } },
        },
      },
      _count: { select: { invitations: true } },
    },
  });
  if (!survey) return null;

  return {
    survey: { id: survey.id, title: survey.title, status: survey.status, sentCount: survey._count.invitations },
    questions: survey.questions,
    rows: survey.responses.map((response) => ({
      respondentName: response.invitation.name,
      respondentEmail: response.invitation.email,
      submittedAt: response.submittedAt.toISOString(),
      answers: Object.fromEntries(response.answers.map((answer) => [answer.questionId, answer.value])),
    })),
  };
}

export type SurveyRecipientRow = {
  id: string;
  email: string;
  name: string | null;
  source: string;
  sentAt: string | null;
  respondedAt: string | null;
};

/** Delivery/response status report — who a survey was sent to, and whether they've responded yet. */
export async function getSurveyRecipients(
  surveyId: string,
): Promise<{ survey: { id: string; title: string }; recipients: SurveyRecipientRow[] } | null> {
  const survey = await db.survey.findUnique({
    where: { id: surveyId },
    select: {
      id: true,
      title: true,
      invitations: {
        orderBy: { email: "asc" },
        select: { id: true, email: true, name: true, source: true, sentAt: true, respondedAt: true },
      },
    },
  });
  if (!survey) return null;

  return {
    survey: { id: survey.id, title: survey.title },
    recipients: survey.invitations.map((invitation) => ({
      id: invitation.id,
      email: invitation.email,
      name: invitation.name,
      source: invitation.source,
      sentAt: invitation.sentAt?.toISOString() ?? null,
      respondedAt: invitation.respondedAt?.toISOString() ?? null,
    })),
  };
}

export type InvitationForResponse = {
  surveyId: string;
  surveyTitle: string;
  surveyDescription: string | null;
  surveyHeroImageUrl: string | null;
  surveyStatus: SurveyStatus;
  respondentName: string | null;
  alreadyResponded: boolean;
  questions: { id: string; prompt: string; type: SurveyQuestionType; required: boolean; options: string[] }[];
};

/** Public respond page's data load — resolves a token to its survey + question set. */
export async function getInvitationByToken(token: string): Promise<InvitationForResponse | null> {
  const invitation = await db.surveyInvitation.findUnique({
    where: { token },
    select: {
      name: true,
      respondedAt: true,
      survey: {
        select: {
          id: true,
          title: true,
          description: true,
          heroImageUrl: true,
          status: true,
          questions: {
            orderBy: { order: "asc" },
            select: { id: true, prompt: true, type: true, required: true, options: true },
          },
        },
      },
    },
  });
  if (!invitation) return null;

  return {
    surveyId: invitation.survey.id,
    surveyTitle: invitation.survey.title,
    surveyDescription: invitation.survey.description,
    surveyHeroImageUrl: getSurveyHeroImageUrl(invitation.survey.heroImageUrl),
    surveyStatus: invitation.survey.status,
    respondentName: invitation.name,
    alreadyResponded: Boolean(invitation.respondedAt),
    questions: invitation.survey.questions,
  };
}

/**
 * Resolves a signed-in member's own invitation token for a survey, for the
 * feed's click-through (app/surveys/[id]/page.tsx) — members reach the
 * response form via their session, not a token in the URL, but there's only
 * one response mechanism (SurveyInvitation.token) so this just looks up the
 * one already created for them at send time and hands back the same
 * /surveys/respond/[token] page every emailed link uses. Null if this
 * member wasn't part of the resolved audience (e.g. a survey sent only to
 * donors/registrants) or the survey doesn't exist.
 */
export async function getMemberInvitationToken(surveyId: string, userId: string): Promise<string | null> {
  const invitation = await db.surveyInvitation.findFirst({
    where: { surveyId, userId },
    select: { token: true },
  });
  return invitation?.token ?? null;
}

/**
 * Writes a respondent's answers, transactionally with stamping
 * `respondedAt` so a repeat submission (double-click, revisited link) is
 * rejected rather than double-counted. Required-question enforcement is
 * re-checked here (not just client-side), keyed by questionId since the
 * client fetches the question set separately from this submission.
 */
export async function submitSurveyResponse(token: string, answers: Record<string, string[]>): Promise<void> {
  const invitation = await db.surveyInvitation.findUnique({
    where: { token },
    select: {
      id: true,
      respondedAt: true,
      survey: { select: { id: true, status: true, questions: { select: { id: true, prompt: true, required: true } } } },
    },
  });
  if (!invitation) throw new SurveyError(404, "Survey not found.");
  if (invitation.survey.status !== SurveyStatus.open) {
    throw new SurveyError(409, "This survey isn't open for responses.");
  }
  if (invitation.respondedAt) {
    throw new SurveyError(409, "You've already responded to this survey.");
  }

  for (const question of invitation.survey.questions) {
    const value = answers[question.id];
    if (question.required && (!value || value.length === 0)) {
      throw new SurveyError(400, `"${question.prompt}" is required.`);
    }
  }

  const validQuestionIds = new Set(invitation.survey.questions.map((question) => question.id));

  await db.$transaction([
    db.surveyResponse.create({
      data: {
        surveyId: invitation.survey.id,
        invitationId: invitation.id,
        answers: {
          create: Object.entries(answers)
            .filter(([questionId, value]) => validQuestionIds.has(questionId) && value.length > 0)
            .map(([questionId, value]) => ({ questionId, value })),
        },
      },
    }),
    db.surveyInvitation.update({ where: { id: invitation.id }, data: { respondedAt: new Date() } }),
  ]);
}
