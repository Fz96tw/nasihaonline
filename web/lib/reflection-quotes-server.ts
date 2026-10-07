import { db } from "@/lib/db";
import type { ReflectionQuoteModel } from "@/lib/generated/prisma/models/ReflectionQuote";
import { pickNextQuote } from "@/lib/reflection-quotes";

/** Next quote to post, or null when the pool has no active quotes. */
export async function getNextReflectionQuote(): Promise<ReflectionQuoteModel | null> {
  const quotes = await db.reflectionQuote.findMany({ where: { active: true } });
  const result = pickNextQuote(quotes);
  return result.status === "ok" ? result.quote : null;
}

/** Records that a quote was just used, moving it to the back of the rotation. */
export async function markReflectionQuotePosted(id: string, postedAt = new Date()): Promise<void> {
  await db.reflectionQuote.update({
    where: { id },
    data: { lastPostedAt: postedAt, timesPosted: { increment: 1 } },
  });
}
