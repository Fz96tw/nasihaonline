import { createClerkClient } from "@clerk/nextjs/server";
import type { Role } from "@/lib/generated/prisma/enums";

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

/**
 * The only supported way a Clerk account is ever created for Nasiha:
 * server-side, via Clerk's backend API, never through Clerk's hosted
 * sign-up UI (which stays disabled at the Clerk project level). This is
 * called by the admin-approval flow once a tier/role is assigned to an
 * applicant, and (for this objective, ahead of that flow existing) by
 * scripts/create-test-user.ts to provision a test account.
 *
 * The invited user sets their own password via Clerk's hosted invitation
 * flow, so no plaintext password ever exists in Nasiha's systems. `role`
 * rides along in publicMetadata so the user.created webhook can assign it
 * to the local User row it creates.
 */
export async function provisionMemberAccount(email: string, role: Role) {
  return clerk.invitations.createInvitation({
    emailAddress: email,
    publicMetadata: { role },
    ignoreExisting: true,
  });
}
