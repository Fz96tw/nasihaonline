// No "server-only" guard: imported by scripts/worker.ts, which runs outside
// Next's server runtime — same convention as lib/meeting-recordings-sync.ts.
import { db } from "@/lib/db";
import { NotificationType } from "@/lib/generated/prisma/enums";
import { sendInboxReminderEmail } from "@/lib/email";
import { INBOX_TIERS } from "@/lib/members";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";

/** A message is "unanswered" once it has sat this long with no reply from its recipient. */
export const REMINDER_AFTER_MS = 3 * 24 * 60 * 60 * 1000;
/**
 * Candidates older than this are ignored (never reminded) — bounds the work of
 * a sweep and keeps a long-dormant message from suddenly triggering an email
 * if the worker was down for a while.
 */
const REMINDER_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Hourly sweep: for every inbox message that has gone REMINDER_AFTER_MS without
 * a reply from its recipient, sends that recipient ONE gentle reminder email
 * per thread, then never considers the message again.
 *
 * - "Answered" = the recipient has taken part in the thread at all (sent any
 *   message in it). Deliberately not "replied after this specific message":
 *   that would nudge people about a conversation-ending "thanks!". So a
 *   reminder only ever goes to someone who has never responded in the thread.
 *   Answered messages are marked processed without an email.
 * - At-most-once: the message row is claimed with an atomic updateMany
 *   (`reminderProcessedAt: null` in the where) *before* the email goes out, so
 *   an overlapping/retried sweep can't double-send. A crash between claim and
 *   send loses that one reminder rather than duplicating it.
 * - Recipients who opted out of `inbox_message` emails, are no longer
 *   inbox-eligible, or are suspended are marked processed with no email.
 */
export async function sendInboxReminders(now: Date = new Date()): Promise<{ sent: number; skipped: number }> {
  const candidates = await db.inboxMessage.findMany({
    where: {
      reminderProcessedAt: null,
      createdAt: {
        lte: new Date(now.getTime() - REMINDER_AFTER_MS),
        gte: new Date(now.getTime() - REMINDER_MAX_AGE_MS),
      },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      parentId: true,
      senderId: true,
      recipientId: true,
      subject: true,
      createdAt: true,
      sender: { select: { name: true } },
      recipient: { select: { email: true, name: true, tier: true, suspended: true } },
    },
  });

  // One reminder per (thread, recipient): several unanswered messages from the
  // same person in one thread are a single nudge, and all get marked processed.
  const groups = new Map<string, typeof candidates>();
  for (const message of candidates) {
    const key = `${message.parentId ?? message.id}:${message.recipientId}`;
    const group = groups.get(key);
    if (group) group.push(message);
    else groups.set(key, [message]);
  }

  let sent = 0;
  let skipped = 0;

  for (const [key, messages] of Array.from(groups.entries())) {
    const rootId = key.split(":")[0];
    const latest = messages[messages.length - 1];
    const ids = messages.map((message) => message.id);
    const recipient = latest.recipient;

    const replied = await db.inboxMessage.findFirst({
      where: {
        senderId: latest.recipientId,
        OR: [{ id: rootId }, { parentId: rootId }],
      },
      select: { id: true },
    });

    const optedOut = await db.notificationPreference.findFirst({
      where: { userId: latest.recipientId, type: NotificationType.inbox_message, optedOut: true },
      select: { id: true },
    });

    const eligible =
      !replied &&
      !optedOut &&
      !recipient.suspended &&
      recipient.tier !== null &&
      INBOX_TIERS.includes(recipient.tier);

    // Atomic claim: only the sweep that flips these rows from null gets to send.
    const claimed = await db.inboxMessage.updateMany({
      where: { id: { in: ids }, reminderProcessedAt: null },
      data: { reminderProcessedAt: now },
    });
    if (claimed.count === 0 || !eligible) {
      skipped += 1;
      continue;
    }

    const root = await db.inboxMessage.findUnique({ where: { id: rootId }, select: { subject: true } });
    const subject = root?.subject ?? null;

    await sendInboxReminderEmail(recipient.email, recipient.name ?? "there", {
      senderName: latest.sender.name ?? "A fellow member",
      subject,
      threadUrl: `${APP_URL}/inbox?item=${rootId}`,
    });
    sent += 1;
  }

  return { sent, skipped };
}
