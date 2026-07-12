import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { syncUserFromClerk } from "@/lib/clerk-sync";
import type { Role } from "@/lib/generated/prisma/enums";
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
  if (user) return user;

  return syncUserFromClerk(userId);
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

export function authErrorResponse(error: AuthError) {
  return NextResponse.json(
    { error: error.status === 401 ? "Unauthorized" : "Forbidden" },
    { status: error.status },
  );
}
