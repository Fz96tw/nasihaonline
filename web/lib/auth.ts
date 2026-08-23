import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { syncUserFromClerk } from "@/lib/clerk-sync";
import { sendWelcomeAnnouncement } from "@/lib/welcome-announcement";
import type { Role, Tier } from "@/lib/generated/prisma/enums";
import type { UserModel } from "@/lib/generated/prisma/models/User";

/**
 * Resolves the current request's Clerk session to Nasiha's own `User` row.
 * Returns null when there is no Clerk session at all. If a session exists
 * but the local row is missing (the user.created webhook hasn't landed —
 * wrong secret, endpoint unreachable, delivery failure), falls back to
 * fetching the user from Clerk directly and syncing on read, so a webhook
 * hiccup can't strand a real, already-authenticated session.
 */
export async function getSessionUser(): Promise<UserModel | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const user = await db.user.findUnique({ where: { clerkUserId: userId } });
  if (user) {
    await maybeSendWelcomeAnnouncement(user);
    void touchLastActive(user);
    return user;
  }

  const synced = await syncUserFromClerk(userId);
  if (synced) {
    await maybeSendWelcomeAnnouncement(synced);
    void touchLastActive(synced);
  }
  return synced;
}

/**
 * Stamps lastActiveAt (shown as "Last active" on /admin/users) — throttled
 * to once per LAST_ACTIVE_THROTTLE_MS since getSessionUser runs on every
 * authenticated request and per-request precision isn't needed. Best-effort,
 * same as maybeSendWelcomeAnnouncement: must never break sign-in. Fired
 * without awaiting (unlike maybeSendWelcomeAnnouncement) — its own try/catch
 * already prevents an unhandled rejection, and this app runs as a long-lived
 * Node process (docker-compose's app/worker services, not serverless/edge),
 * so the write still completes in the background after the response is sent.
 */
const LAST_ACTIVE_THROTTLE_MS = 5 * 60 * 1000;

async function touchLastActive(user: UserModel): Promise<void> {
  if (user.lastActiveAt && Date.now() - user.lastActiveAt.getTime() < LAST_ACTIVE_THROTTLE_MS) return;
  try {
    await db.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } });
  } catch (error) {
    console.error("Failed to update lastActiveAt", error);
  }
}

/**
 * Fires the welcome shout-out on a member's first *sign-in* (not
 * registration) — this is the universal choke point every authenticated
 * request passes through. The atomic updateMany only flips
 * welcomeAnnouncementSentAt from null once, so concurrent requests across
 * server components/tabs can't double-post. Failures are swallowed: this
 * must never break sign-in.
 */
async function maybeSendWelcomeAnnouncement(user: UserModel): Promise<void> {
  if (user.welcomeAnnouncementSentAt) return;
  // Name is set at invite time if the application had one, otherwise only
  // once the member saves it via PATCH /api/profile — wait rather than
  // locking in the generic fallback on whichever request happens first.
  if (!user.name?.trim()) return;
  try {
    const { count } = await db.user.updateMany({
      where: { id: user.id, welcomeAnnouncementSentAt: null },
      data: { welcomeAnnouncementSentAt: new Date() },
    });
    if (count > 0) {
      await sendWelcomeAnnouncement(user);
    }
  } catch (error) {
    console.error("Failed to send welcome announcement", error);
  }
}

export class AuthError extends Error {
  constructor(public readonly status: 401 | 403) {
    super(status === 401 ? "Unauthorized" : "Forbidden");
  }
}

/**
 * Throws AuthError(401) if there's no authenticated session with a matching
 * local User row. Callers in API routes should catch AuthError and translate
 * it via authErrorResponse(); page/server components can let it propagate.
 */
export async function requireUser(): Promise<UserModel> {
  const user = await getSessionUser();
  if (!user) throw new AuthError(401);
  // Suspension (§4.15) is a login/access gate, not a role change — block it
  // here so every caller of requireUser/requireRole/requireTier inherits the
  // check uniformly, without touching each protected route individually.
  if (user.suspended) throw new AuthError(403);
  return user;
}

/**
 * Throws AuthError(401) if unauthenticated, AuthError(403) if authenticated
 * but the user's role isn't in `roles`.
 */
export async function requireRole(roles: Role[]): Promise<UserModel> {
  const user = await requireUser();
  if (!roles.includes(user.role)) throw new AuthError(403);
  return user;
}

/**
 * Throws AuthError(401) if unauthenticated, AuthError(403) if authenticated
 * but the user has no tier or their tier isn't in `tiers` — the gate for
 * tier-restricted member actions like Submit Event (§4.6).
 */
export async function requireTier(tiers: Tier[]): Promise<UserModel> {
  const user = await requireUser();
  if (!user.tier || !tiers.includes(user.tier)) throw new AuthError(403);
  return user;
}

export function authErrorResponse(error: AuthError) {
  return NextResponse.json(
    { error: error.status === 401 ? "Unauthorized" : "Forbidden" },
    { status: error.status },
  );
}
