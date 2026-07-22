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
 * `firstName`/`lastName` ride along the same way so that row gets a `name`
 * on creation without asking the applicant to type it again during
 * accept-invite — they already gave it on the application form.
 *
 * redirectUrl points at our own /accept-invite (a <SignUp/> mount) rather
 * than leaving Clerk to default to its generic hosted Account Portal —
 * the ticket Clerk issues here is a sign-up ticket (setting an initial
 * password for a brand-new account), which needs a <SignUp/>-shaped form;
 * <SignIn/> can't render that step. Restricted mode still rejects anyone
 * without a valid ticket at /accept-invite, so this doesn't reopen
 * self-serve registration.
 *
 * notify: false stops Clerk from sending its own invitation email — those
 * count against Clerk's dev-instance monthly email cap independently of
 * the email-verification/device-code toggles in the Clerk dashboard, so
 * disabling those doesn't stop them. With notify: false, Clerk returns the
 * accept-invite `url` on the response instead, which the caller forwards
 * via the app's own Resend-based welcome email.
 */
export async function provisionMemberAccount(
  email: string,
  role: Role,
  tier?: Tier,
  firstName?: string,
  lastName?: string,
) {
  const name = [firstName, lastName].filter(Boolean).join(" ") || undefined;
  return clerk.invitations.createInvitation({
    emailAddress: email,
    publicMetadata: { role, ...(tier ? { tier } : {}), ...(name ? { name } : {}) },
    ignoreExisting: true,
    redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL}/accept-invite`,
    notify: false,
  });
}

/**
 * Re-issues a sign-up ticket for an applicant who was already approved but
 * never completed (or never received) the original invite — e.g. the
 * welcome email bounced/never sent, or the link expired. Clerk only ever
 * returns an invitation's `url` once, at creation time, so there's no way
 * to fetch the original link back; revoking any still-pending invitation
 * for this email and creating a fresh one is the only way to get a new,
 * valid `url` to re-send. Safe to call even if no prior invitation exists
 * (ignoreExisting: true) or if one was already revoked/expired/accepted —
 * Clerk just issues a new one regardless.
 */
export async function resendMemberInvitation(
  email: string,
  role: Role,
  tier?: Tier,
  firstName?: string,
  lastName?: string,
) {
  const { data: pending } = await clerk.invitations.getInvitationList({
    query: email,
    status: "pending",
  });
  await Promise.all(
    pending
      .filter((invitation) => invitation.emailAddress === email)
      .map((invitation) => clerk.invitations.revokeInvitation(invitation.id)),
  );

  return provisionMemberAccount(email, role, tier, firstName, lastName);
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
