import { redirect } from "next/navigation";
import { SignUp } from "@clerk/nextjs";
import { getSessionUser } from "@/lib/auth";

/**
 * Handles Clerk's invitation-ticket flow only (setting an initial password
 * for an account lib/clerk-admin.ts already created server-side). This is
 * NOT a self-serve registration page: Clerk's Restricted sign-up mode
 * rejects any attempt to complete sign-up here without a valid
 * __clerk_ticket, regardless of this component existing.
 */
export default async function AcceptInvitePage() {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <SignUp routing="hash" />
    </main>
  );
}
