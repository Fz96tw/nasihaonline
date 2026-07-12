import { createClerkClient } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { Role, Tier } from "@/lib/generated/prisma/enums";
import type { UserModel } from "@/lib/generated/prisma/models/User";

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

const KNOWN_ROLES = new Set<string>(Object.values(Role));
const KNOWN_TIERS = new Set<string>(Object.values(Tier));

function roleFromMetadata(publicMetadata: Record<string, unknown>): Role {
  const role = publicMetadata.role;
  return typeof role === "string" && KNOWN_ROLES.has(role) ? (role as Role) : Role.applicant;
}

function tierFromMetadata(publicMetadata: Record<string, unknown>): Tier | undefined {
  const tier = publicMetadata.tier;
  return typeof tier === "string" && KNOWN_TIERS.has(tier) ? (tier as Tier) : undefined;
}

/**
 * The Profile row is only nested-created on first insert (the `create`
 * branch below), never touched on `update` — later Clerk metadata syncs
 * (e.g. a role/tier change) shouldn't reset profile fields a member has
 * since filled in via the (future) Profile domain UI, §4.3.
 */
export async function upsertUserFromClerkData(
  clerkUserId: string,
  email: string,
  publicMetadata: Record<string, unknown>,
): Promise<UserModel> {
  return db.user.upsert({
    where: { clerkUserId },
    create: {
      clerkUserId,
      email,
      role: roleFromMetadata(publicMetadata),
      tier: tierFromMetadata(publicMetadata),
      profile: { create: {} },
    },
    update: { email, role: roleFromMetadata(publicMetadata), tier: tierFromMetadata(publicMetadata) },
  });
}

/**
 * Fallback for when the user.created/updated webhook hasn't landed yet
 * (misconfigured secret, endpoint unreachable, delivery delay/failure):
 * fetches the Clerk user directly and upserts on read, so a webhook
 * hiccup can't permanently strand an otherwise-valid session — see
 * getSessionUser() in lib/auth.ts, which calls this as a fallback.
 */
export async function syncUserFromClerk(clerkUserId: string): Promise<UserModel | null> {
  const clerkUser = await clerk.users.getUser(clerkUserId).catch(() => null);
  if (!clerkUser) return null;

  const primaryEmail =
    clerkUser.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId) ??
    clerkUser.emailAddresses[0];
  if (!primaryEmail) return null;

  return upsertUserFromClerkData(
    clerkUserId,
    primaryEmail.emailAddress,
    clerkUser.publicMetadata,
  );
}
