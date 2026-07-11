import "dotenv/config";
import { Role } from "@/lib/generated/prisma/enums";
import { provisionMemberAccount } from "@/lib/clerk-admin";

/**
 * Server-side-only provisioning script — never a client-reachable endpoint.
 * Stands in for objective 6's admin-approval flow, which will call
 * provisionMemberAccount() the same way once it exists. Usage:
 *
 *   npx tsx scripts/create-test-user.ts <email> [role]
 */
async function main() {
  const [email, roleArg = "member"] = process.argv.slice(2);

  if (!email) {
    console.error("Usage: npx tsx scripts/create-test-user.ts <email> [role]");
    process.exit(1);
  }

  const validRoles = Object.values(Role);
  if (!validRoles.includes(roleArg as Role)) {
    console.error(`Invalid role "${roleArg}". Valid roles: ${validRoles.join(", ")}`);
    process.exit(1);
  }

  const invitation = await provisionMemberAccount(email, roleArg as Role);
  console.log(
    `Invitation sent to ${email} (role: ${roleArg}). Invitation id: ${invitation.id}.\n` +
      `The local User row is created by the user.created webhook once they accept and set a password.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
