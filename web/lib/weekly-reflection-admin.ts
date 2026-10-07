// No "server-only" guard (like lib/weekly-reflection-post.ts): exercised from
// the DB-backed tests outside Next. Authorization is the callers' job — every
// route that reaches these does requireRole([Role.admin]) first and passes the
// acting admin's id, which each mutation writes to the audit log in the same
// transaction as the change it documents.
import { db } from "@/lib/db";
import { recordAdminAction } from "@/lib/audit-server";
import { skipNextReflectionQuote } from "@/lib/reflection-quotes-server";
import { postWeeklyReflection, type WeeklyReflectionResult } from "@/lib/weekly-reflection-post";
import type { ReflectionMessage, ReflectionQuoteFields } from "@/lib/validation/weekly-reflection";

const SETTINGS_ROW_ID = 1;

export class ReflectionAdminError extends Error {
  constructor(
    public readonly status: 400 | 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

export async function updateReflectionSettings(
  actorId: string,
  input: { weeklyReflectionEnabled?: boolean; weeklyReflectionDayOfWeek?: number; weeklyReflectionHour?: number },
): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.siteSettings.upsert({
      where: { id: SETTINGS_ROW_ID },
      create: { id: SETTINGS_ROW_ID, ...input },
      update: input,
    });
    await recordAdminAction(
      { actorId, action: "weekly_reflection.settings_updated", entityType: "SiteSettings", metadata: input },
      tx,
    );
  });
}

/** Saves the wording of future weekly posts. Threads already posted are not touched. */
export async function updateReflectionMessage(actorId: string, input: ReflectionMessage): Promise<void> {
  const data = { weeklyReflectionTitleTemplate: input.titleTemplate, weeklyReflectionBodyTemplate: input.bodyTemplate };
  await db.$transaction(async (tx) => {
    await tx.siteSettings.upsert({ where: { id: SETTINGS_ROW_ID }, create: { id: SETTINGS_ROW_ID, ...data }, update: data });
    await recordAdminAction(
      {
        actorId,
        action: "weekly_reflection.message_updated",
        entityType: "SiteSettings",
        metadata: { titleTemplate: input.titleTemplate, bodyTemplate: input.bodyTemplate },
      },
      tx,
    );
  });
}

export async function createReflectionQuote(actorId: string, input: ReflectionQuoteFields) {
  try {
    return await db.$transaction(async (tx) => {
      const quote = await tx.reflectionQuote.create({ data: input });
      await recordAdminAction(
        {
          actorId,
          action: "weekly_reflection.quote_created",
          entityType: "ReflectionQuote",
          entityId: quote.id,
          metadata: { author: quote.author },
        },
        tx,
      );
      return quote;
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      throw new ReflectionAdminError(409, "That quote is already in the pool.");
    }
    throw error;
  }
}

/** Edit and/or retire/reactivate. There is deliberately no delete: retiring keeps the posting history intact. */
export async function updateReflectionQuote(
  actorId: string,
  id: string,
  input: Partial<ReflectionQuoteFields> & { active?: boolean },
) {
  const existing = await db.reflectionQuote.findUnique({ where: { id } });
  if (!existing) throw new ReflectionAdminError(404, "Quote not found.");

  const { active, ...fields } = input;
  const edited = Object.keys(fields).length > 0;
  const activeChanged = active !== undefined && active !== existing.active;

  try {
    return await db.$transaction(async (tx) => {
      const quote = await tx.reflectionQuote.update({
        where: { id },
        data: { ...fields, ...(active !== undefined ? { active } : {}) },
      });
      if (edited) {
        await recordAdminAction(
          {
            actorId,
            action: "weekly_reflection.quote_updated",
            entityType: "ReflectionQuote",
            entityId: id,
            metadata: { fields: Object.keys(fields) },
          },
          tx,
        );
      }
      if (activeChanged) {
        await recordAdminAction(
          {
            actorId,
            action: active ? "weekly_reflection.quote_reactivated" : "weekly_reflection.quote_retired",
            entityType: "ReflectionQuote",
            entityId: id,
          },
          tx,
        );
      }
      return quote;
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      throw new ReflectionAdminError(409, "That quote is already in the pool.");
    }
    throw error;
  }
}

/** Skip whatever is next in line (see skipNextReflectionQuote). Returns the skipped quote's id, or null if the pool is empty. */
export async function skipNextQuote(actorId: string, now: Date = new Date()): Promise<string | null> {
  const skipped = await skipNextReflectionQuote(now);
  if (!skipped) return null;
  await recordAdminAction({
    actorId,
    action: "weekly_reflection.next_skipped",
    entityType: "ReflectionQuote",
    entityId: skipped.quote.id,
    metadata: { via: skipped.via },
  });
  return skipped.quote.id;
}

/** "Swap": make `quoteId` the next post, instead of the normal rotation. */
export async function swapNextQuote(actorId: string, quoteId: string): Promise<void> {
  const quote = await db.reflectionQuote.findUnique({ where: { id: quoteId } });
  if (!quote) throw new ReflectionAdminError(404, "Quote not found.");
  if (!quote.active) throw new ReflectionAdminError(400, "A retired quote can't be made next. Reactivate it first.");
  await db.$transaction(async (tx) => {
    await tx.siteSettings.upsert({
      where: { id: SETTINGS_ROW_ID },
      create: { id: SETTINGS_ROW_ID, weeklyReflectionNextQuoteId: quoteId },
      update: { weeklyReflectionNextQuoteId: quoteId },
    });
    await recordAdminAction(
      { actorId, action: "weekly_reflection.next_swapped", entityType: "ReflectionQuote", entityId: quoteId },
      tx,
    );
  });
}

/** Drop a swap override so the normal rotation decides again. */
export async function clearNextQuoteOverride(actorId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.siteSettings.upsert({
      where: { id: SETTINGS_ROW_ID },
      create: { id: SETTINGS_ROW_ID },
      update: { weeklyReflectionNextQuoteId: null },
    });
    await recordAdminAction({ actorId, action: "weekly_reflection.next_cleared", entityType: "SiteSettings" }, tx);
  });
}

/**
 * Admin "Post now": the very same postWeeklyReflection the worker runs. If this
 * week already has its thread it returns {status: "already-posted"} untouched
 * unless `override` was explicitly confirmed, in which case a further thread
 * is posted (and the previous one unpinned, as always).
 */
export async function postReflectionNow(
  actorId: string,
  { override = false }: { override?: boolean } = {},
  now: Date = new Date(),
  options: Omit<NonNullable<Parameters<typeof postWeeklyReflection>[1]>, "allowAdditional"> = {},
): Promise<WeeklyReflectionResult> {
  const result = await postWeeklyReflection(now, { ...options, allowAdditional: override });
  if (result.status === "posted") {
    await recordAdminAction({
      actorId,
      action: "weekly_reflection.posted_now",
      entityType: "ReflectionPost",
      entityId: result.threadId,
      metadata: { weekKey: result.weekKey, quoteId: result.quoteId, override },
    });
  }
  return result;
}
