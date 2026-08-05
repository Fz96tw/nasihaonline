import { createClerkClient } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { Role, Tier } from "@/lib/generated/prisma/enums";
import type { UserModel } from "@/lib/generated/prisma/models/User";
import { enqueueProfileIndexSync } from "@/lib/queues/search-index-queue";

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

function nameFromMetadata(publicMetadata: Record<string, unknown>): string | undefined {
  const name = publicMetadata.name;
  return typeof name === "string" && name.trim() ? name : undefined;
}

/**
 * The Profile row is only nested-created on first insert (the `create`
 * branch below), never touched on `update` — later Clerk metadata syncs
 * (e.g. a role/tier change) shouldn't reset profile fields a member has
 * since filled in via the (future) Profile domain UI, §4.3. `name` follows
 * the same rule: it's seeded from the invitation's metadata (see
 * provisionMemberAccount) only on creation, then owned entirely by the
 * member via PATCH /api/profile — a later metadata sync must not clobber
 * an edit they've made there.
 */
export async function upsertUserFromClerkData(
  clerkUserId: string,
  email: string,
  publicMetadata: Record<string, unknown>,
): Promise<UserModel> {
  const user = await db.user.upsert({
    where: { clerkUserId },
    create: {
      clerkUserId,
      email,
      name: nameFromMetadata(publicMetadata),
      role: roleFromMetadata(publicMetadata),
      tier: tierFromMetadata(publicMetadata),
      requiresProfileOnboarding: true,
      profile: { create: {} },
    },
    update: { email, role: roleFromMetadata(publicMetadata), tier: tierFromMetadata(publicMetadata) },
  });

  // The nested Profile row above (create branch only) was otherwise never
  // enqueued for Meilisearch indexing — enqueueProfileIndexSync was only
  // ever called from the profile-edit/avatar-upload routes, so a brand-new
  // member stayed invisible to every search-backed feature (Directory
  // search, @-mention autocomplete, the restricted-event invitee picker)
  // until they happened to edit their profile. Enqueuing on every upsert
  // (not just create) is deliberately simple and idempotent — the worker
  // re-derives eligibility from the DB regardless of what triggered it —
  // rather than threading a "was this a create" flag through here.
  await enqueueProfileIndexSync(user.id);

  return user;
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
