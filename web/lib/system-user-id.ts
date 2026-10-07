// Dependency-free pieces of the organizational ("system") account concept, so
// pure code (the feed author builder, node:test) can use them without pulling
// in the database. lib/system-user.ts re-exports these.

// Organizational accounts (not people) that author automated content, such as
// the Weekly Reflection forum thread. They have no Clerk login: the required,
// unique `clerkUserId` holds a "system:" placeholder that can never collide
// with a real Clerk id (those start "user_").
export const SYSTEM_CLERK_USER_ID_PREFIX = "system:";

export function isSystemUser(user: { clerkUserId: string }): boolean {
  return user.clerkUserId.startsWith(SYSTEM_CLERK_USER_ID_PREFIX);
}

/** What an organizational account looks like where a person's photo would be — the same logo the NASIHA Board sender uses. */
export const ORGANIZATION_AVATAR_URL = "/images/nasihalogo-cropped.png";
