import { db } from "@/lib/db";
import { Role } from "@/lib/generated/prisma/enums";
import type { UserModel } from "@/lib/generated/prisma/models/User";

// Organizational accounts (not people) that author automated content, such
// as the Weekly Reflection forum thread. They have no Clerk login: the
// required, unique `clerkUserId` holds a "system:" placeholder that can never
// collide with a real Clerk id (those start "user_"), so the Clerk webhook's
// user.deleted handler can never match one.
const SYSTEM_CLERK_USER_ID_PREFIX = "system:";

export function isSystemUser(user: { clerkUserId: string }): boolean {
  return user.clerkUserId.startsWith(SYSTEM_CLERK_USER_ID_PREFIX);
}

export const WEEKLY_REFLECTION_USER = {
  clerkUserId: `${SYSTEM_CLERK_USER_ID_PREFIX}weekly-reflection`,
  // Not a real mailbox — unique email is just required by the schema.
  email: "weekly-reflection@system.invalid",
  name: "NASIHA Weekly Reflection",
  bio: "Posts the weekly reflection prompt on behalf of the NASIHA team.",
} as const;

/**
 * Idempotent. tier stays null on purpose: every broadcast audience
 * (announcements, surveys, weekly digest) requires `tier: { not: null }` and
 * the Directory requires a tier in DIRECTORY_TIERS, so a null-tier account is
 * excluded from all of them. listInDirectory is also set false explicitly
 * since Profile defaults it to true.
 */
export async function getOrCreateWeeklyReflectionUser(): Promise<UserModel> {
  const { clerkUserId, email, name, bio } = WEEKLY_REFLECTION_USER;
  return db.user.upsert({
    where: { clerkUserId },
    update: {},
    create: {
      clerkUserId,
      email,
      name,
      role: Role.member,
      tier: null,
      profile: { create: { bio, listInDirectory: false } },
    },
  });
}

/** The Weekly Reflection account if it exists — unlike getOrCreate…, never creates it. */
export async function findWeeklyReflectionUser(): Promise<UserModel | null> {
  return db.user.findUnique({ where: { clerkUserId: WEEKLY_REFLECTION_USER.clerkUserId } });
}

/** Subset of `userIds` that are organizational (Clerk-less) accounts — used to keep them out of notification recipient sets. */
export async function getSystemUserIds(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const rows = await db.user.findMany({
    where: { id: { in: userIds }, clerkUserId: { startsWith: SYSTEM_CLERK_USER_ID_PREFIX } },
    select: { id: true },
  });
  return new Set(rows.map((row) => row.id));
}
