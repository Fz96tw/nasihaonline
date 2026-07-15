import { createClerkClient } from "@clerk/nextjs/server";
import type { Role, Tier } from "@/lib/generated/prisma/enums";

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

/**
 * The only supported way a Clerk account is ever created for Nasiha:
 * server-side, via Clerk's backend API, never through Clerk's hosted
 * sign-up UI (which stays disabled at the Clerk project level). Called by
 * the admin-approval flow (app/api/admin/applications/[id]/route.ts) once
 * a tier/role is assigned to an applicant, and by
 * scripts/create-test-user.ts to provision a test account.
 *
 * The invited user sets their own password via Clerk's hosted invitation
 * flow, so no plaintext password ever exists in Nasiha's systems. `role`
 * and `tier` ride along in publicMetadata so the user.created webhook
 * (lib/clerk-sync.ts) can assign them to the local User row it creates.
 *
 * redirectUrl points at our own /accept-invite (a <SignUp/> mount) rather
 * than leaving Clerk to default to its generic hosted Account Portal —
 * the ticket Clerk issues here is a sign-up ticket (setting an initial
 * password for a brand-new account), which needs a <SignUp/>-shaped form;
 * <SignIn/> can't render that step. Restricted mode still rejects anyone
 * without a valid ticket at /accept-invite, so this doesn't reopen
 * self-serve registration.
 */
export async function provisionMemberAccount(email: string, role: Role, tier?: Tier) {
  return clerk.invitations.createInvitation({
    emailAddress: email,
    publicMetadata: tier ? { role, tier } : { role },
    ignoreExisting: true,
    redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL}/accept-invite`,
  });
}

/**
 * Role/tier is sourced from Clerk's publicMetadata on every user.updated
 * webhook (lib/clerk-sync.ts's roleFromMetadata/tierFromMetadata) — a role
 * change written only to Postgres would get silently overwritten by the
 * next such webhook. This keeps the two in sync whenever an admin edits
 * role/tier from /admin/users, the same way provisionMemberAccount already
 * does for a brand-new invitation.
 */
export async function syncUserRoleTierToClerk(clerkUserId: string, role: Role, tier: Tier | null) {
  await clerk.users.updateUserMetadata(clerkUserId, {
    publicMetadata: tier ? { role, tier } : { role, tier: null },
  });
}
