import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { AdminActionLogModel } from "@/lib/generated/prisma/models/AdminActionLog";

/** Anything with an `.adminActionLog` delegate — the top-level client or a `$transaction` callback's `tx`. Same convention as NotificationClient in lib/notifications-server.ts. */
type AuditClient = Prisma.TransactionClient | typeof db;

export type RecordAdminActionInput = {
  actorId: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Writes one AdminActionLog row. Takes an optional `client` so callers
 * already inside a `db.$transaction(async (tx) => ...)` callback pass `tx`,
 * keeping the log write atomic with the domain write it documents. Do NOT
 * pass this into a batch-style `db.$transaction([...])` array — that form
 * requires raw, unexecuted `db.<model>.create(...)` objects, not a function
 * that awaits internally (see conduct-server.ts's call site, which uses a
 * raw create() for exactly this reason).
 */
export async function recordAdminAction(
  input: RecordAdminActionInput,
  client: AuditClient = db,
): Promise<void> {
  await client.adminActionLog.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      metadata: (input.metadata as Prisma.InputJsonValue | undefined) ?? undefined,
    },
  });
}

export type AdminActionLogEntry = AdminActionLogModel & {
  actor: { id: string; name: string | null; email: string };
};

/** Reverse-chronological feed for /admin/activity. Fetches `take + 1` to know if there's a next page without a separate count(). */
export async function getAdminActionLog(
  params: { take?: number; before?: Date } = {},
): Promise<{ items: AdminActionLogEntry[]; hasMore: boolean }> {
  const take = params.take ?? 50;
  const rows = await db.adminActionLog.findMany({
    where: params.before ? { createdAt: { lt: params.before } } : undefined,
    orderBy: { createdAt: "desc" },
    take: take + 1,
    include: { actor: { select: { id: true, name: true, email: true } } },
  });
  return { items: rows.slice(0, take), hasMore: rows.length > take };
}

/** Log entries for a specific set of entities, oldest first — used to render inline "who did what" history next to a domain's own list (e.g. contact messages). */
export async function getAdminActionLogForEntities(
  entityType: string,
  entityIds: string[],
): Promise<Map<string, AdminActionLogEntry[]>> {
  if (entityIds.length === 0) return new Map();

  const rows = await db.adminActionLog.findMany({
    where: { entityType, entityId: { in: entityIds } },
    orderBy: { createdAt: "asc" },
    include: { actor: { select: { id: true, name: true, email: true } } },
  });

  const grouped = new Map<string, AdminActionLogEntry[]>();
  for (const row of rows) {
    if (!row.entityId) continue;
    const existing = grouped.get(row.entityId);
    if (existing) existing.push(row);
    else grouped.set(row.entityId, [row]);
  }
  return grouped;
}
