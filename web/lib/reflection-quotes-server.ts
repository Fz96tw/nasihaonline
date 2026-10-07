import { db } from "@/lib/db";
import type { ReflectionQuoteModel } from "@/lib/generated/prisma/models/ReflectionQuote";
import { pickNextQuote } from "@/lib/reflection-quotes";
import { getWeeklyReflectionSettings, setWeeklyReflectionNextQuoteId } from "@/lib/settings";

export type NextReflectionQuote = {
  quote: ReflectionQuoteModel;
  /** "override" = an admin swapped it in; "rotation" = least-recently-posted. */
  via: "override" | "rotation";
};

/**
 * The quote the next post will use — the single source of truth for both the
 * poster (lib/weekly-reflection-post.ts) and the admin preview, so what the
 * page shows can't drift from what actually gets posted. An admin's swap
 * override wins as long as that quote is still active; otherwise (cleared,
 * deleted or retired) the normal rotation applies. Null when nothing is active.
 */
export async function resolveNextReflectionQuote(): Promise<NextReflectionQuote | null> {
  const { weeklyReflectionNextQuoteId } = await getWeeklyReflectionSettings();
  if (weeklyReflectionNextQuoteId) {
    const override = await db.reflectionQuote.findFirst({ where: { id: weeklyReflectionNextQuoteId, active: true } });
    if (override) return { quote: override, via: "override" };
  }
  const result = pickNextQuote(await db.reflectionQuote.findMany({ where: { active: true } }));
  return result.status === "ok" ? { quote: result.quote, via: "rotation" } : null;
}

/** Records that a quote was just used, moving it to the back of the rotation. */
export async function markReflectionQuotePosted(id: string, postedAt = new Date()): Promise<void> {
  await db.reflectionQuote.update({
    where: { id },
    data: { lastPostedAt: postedAt, timesPosted: { increment: 1 } },
  });
}

/**
 * "Skip" the quote that is next in line without posting it. A swapped-in
 * override is simply cleared (the rotation resumes); a rotation pick is moved
 * to the back of the queue by stamping lastPostedAt, deliberately WITHOUT
 * touching timesPosted so it still reads as unused. Returns what was skipped.
 */
export async function skipNextReflectionQuote(now = new Date()): Promise<NextReflectionQuote | null> {
  const next = await resolveNextReflectionQuote();
  if (!next) return null;
  if (next.via === "override") {
    await setWeeklyReflectionNextQuoteId(null);
  } else {
    await db.reflectionQuote.update({ where: { id: next.quote.id }, data: { lastPostedAt: now } });
  }
  return next;
}
