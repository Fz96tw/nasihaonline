// No "server-only" guard: called from scripts/worker.ts (outside Next's
// runtime) as well as, later, the admin "post now" action.
import { db } from "@/lib/db";
import { ForumThreadVisibility } from "@/lib/generated/prisma/enums";
import { WEEKLY_REFLECTION_FORUM_SLUG } from "@/lib/forums";
import { resolveNextReflectionQuote } from "@/lib/reflection-quotes-server";
import { isoWeekKey, isoWeekStart } from "@/lib/reflection-schedule";
import {
  DEFAULT_BODY_TEMPLATE,
  DEFAULT_TITLE_TEMPLATE,
  buildReflectionValues,
  buildTitleValues,
  renderReflectionTemplate,
} from "@/lib/reflection-template";
import { getWeeklyReflectionMessage } from "@/lib/settings";
import { reflectionMessageSchema } from "@/lib/validation/weekly-reflection";
import { findWeeklyReflectionUser } from "@/lib/system-user";
import { enqueueForumThreadIndexSync } from "@/lib/queues/search-index-queue";

export type WeeklyReflectionSkipReason = "forum-missing" | "system-user-missing" | "pool-empty";

export type WeeklyReflectionResult =
  | { status: "posted"; weekKey: string; threadId: string; quoteId: string }
  | { status: "already-posted"; weekKey: string; threadId: string | null }
  | { status: "skipped"; weekKey: string; reason: WeeklyReflectionSkipReason };

const SKIP_MESSAGES: Record<WeeklyReflectionSkipReason, string> = {
  "forum-missing": `no active forum with slug "${WEEKLY_REFLECTION_FORUM_SLUG}" — run the seed`,
  "system-user-missing": "the NASIHA Weekly Reflection system user doesn't exist — run the seed",
  "pool-empty": "the quote pool has no active quotes",
};

/**
 * The admin-edited wording, or the defaults if what's stored fails today's
 * validation (e.g. edited directly in the database): a bad template must never
 * stop the week's post or put a literal "{qoute}" in front of members.
 */
async function loadMessageTemplates(): Promise<{ titleTemplate: string; bodyTemplate: string }> {
  const stored = await getWeeklyReflectionMessage();
  const parsed = reflectionMessageSchema.safeParse(stored);
  if (parsed.success) return parsed.data;
  console.warn("[weekly-reflection] stored message template is invalid; using the default wording:", parsed.error.issues[0]?.message);
  return { titleTemplate: DEFAULT_TITLE_TEMPLATE, bodyTemplate: DEFAULT_BODY_TEMPLATE };
}

/**
 * Posts this week's reflection thread: the next quote from the pool, as a
 * pinned thread in the Weekly Reflection forum authored by the organizational
 * system user, unpinning the previous week's.
 *
 * Safe to call any number of times in a week — worker restarts, overlapping
 * ticks, an admin pressing "post now" — only the first creates a thread. The
 * guard is the UNIQUE ReflectionPost.weekKey, written in the same transaction
 * as the thread, so there is no window where a thread exists without its
 * record (duplicate next tick) or the record without the thread (week lost).
 * Expected failure modes return {status: "skipped"} and log; they never throw,
 * so a missing forum can't crash-loop the worker. Anything unexpected rolls
 * the transaction back and propagates, leaving the week free to retry.
 *
 * Deliberately not built on createForumThread: that runs its own transaction,
 * which can't be made atomic with the weekly record.
 */
export async function postWeeklyReflection(
  now: Date = new Date(),
  // Injectable so tests don't push jobs onto the real Redis search-index queue.
  {
    enqueueIndexSync = enqueueForumThreadIndexSync,
    allowAdditional = false,
  }: {
    enqueueIndexSync?: (threadId: string) => Promise<void>;
    /** Admin "post now" with the override confirmed: post a further thread this week (weekKey "<week>-extra-N"). */
    allowAdditional?: boolean;
  } = {},
): Promise<WeeklyReflectionResult> {
  const baseKey = isoWeekKey(now);
  let weekKey = baseKey;

  const existing = await db.reflectionPost.findUnique({ where: { weekKey }, select: { threadId: true } });
  if (existing) {
    if (!allowAdditional) return { status: "already-posted", weekKey, threadId: existing.threadId };
    const extras = await db.reflectionPost.count({ where: { weekKey: { startsWith: `${baseKey}-extra-` } } });
    weekKey = `${baseKey}-extra-${extras + 1}`;
  }

  const skip = (reason: WeeklyReflectionSkipReason): WeeklyReflectionResult => {
    console.warn(`[weekly-reflection] skipping ${weekKey}: ${SKIP_MESSAGES[reason]}`);
    return { status: "skipped", weekKey, reason };
  };

  const forum = await db.forum.findFirst({
    where: { slug: WEEKLY_REFLECTION_FORUM_SLUG, active: true },
    select: { id: true },
  });
  if (!forum) return skip("forum-missing");

  const author = await findWeeklyReflectionUser();
  if (!author) return skip("system-user-missing");

  const next = await resolveNextReflectionQuote();
  if (!next) return skip("pool-empty");
  const { quote } = next;

  const { titleTemplate, bodyTemplate } = await loadMessageTemplates();
  const weekStart = isoWeekStart(now);
  const title = renderReflectionTemplate(titleTemplate, buildTitleValues(quote, weekStart));
  const body = renderReflectionTemplate(bodyTemplate, buildReflectionValues(quote, weekStart));

  let threadId: string;
  try {
    threadId = await db.$transaction(async (tx) => {
      const previous = await tx.reflectionPost.findMany({
        where: { threadId: { not: null } },
        select: { threadId: true },
      });
      await tx.forumThread.updateMany({
        where: { id: { in: previous.flatMap((row) => (row.threadId ? [row.threadId] : [])) }, pinned: true },
        data: { pinned: false },
      });

      const thread = await tx.forumThread.create({
        data: {
          forumId: forum.id,
          authorId: author.id,
          title,
          pinned: true,
          visibility: ForumThreadVisibility.community,
          posts: { create: { authorId: author.id, body } },
        },
        select: { id: true },
      });
      await tx.reflectionPost.create({
        data: { weekKey, threadId: thread.id, quoteId: quote.id, postedAt: now },
      });
      await tx.reflectionQuote.update({
        where: { id: quote.id },
        data: { lastPostedAt: now, timesPosted: { increment: 1 } },
      });
      // Consume an admin's "swap" override so it applies to exactly one post.
      await tx.siteSettings.updateMany({
        where: { id: 1, weeklyReflectionNextQuoteId: quote.id },
        data: { weeklyReflectionNextQuoteId: null },
      });
      return thread.id;
    });
  } catch (error) {
    // Lost a race to another run for this week: the whole transaction rolled
    // back (no stray thread), and the winner's row is what already-posted reports.
    if ((error as { code?: string }).code === "P2002") {
      const winner = await db.reflectionPost.findUnique({ where: { weekKey }, select: { threadId: true } });
      return { status: "already-posted", weekKey, threadId: winner?.threadId ?? null };
    }
    throw error;
  }

  // After commit: a Meilisearch/Redis hiccup must not undo or fail a post
  // that already exists. scripts/reindex-forum-threads.ts backfills if needed.
  try {
    await enqueueIndexSync(threadId);
  } catch (error) {
    console.error(`[weekly-reflection] posted ${threadId} but couldn't enqueue its search-index sync:`, error);
  }

  return { status: "posted", weekKey, threadId, quoteId: quote.id };
}
