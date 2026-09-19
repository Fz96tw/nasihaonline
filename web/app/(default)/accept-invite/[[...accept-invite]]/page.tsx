import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignUp } from "@clerk/nextjs";
import { getSessionUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Accept Invitation",
  robots: { index: false, follow: false },
};

/**
 * Handles Clerk's invitation-ticket flow only (setting an initial password
 * for an account lib/clerk-admin.ts already created server-side). This is
 * NOT a self-serve registration page: Clerk's Restricted sign-up mode
 * rejects any attempt to complete sign-up here without a valid
 * __clerk_ticket, regardless of this component existing.
 */
export default async function AcceptInvitePage() {
  const user = await getSessionUser();
  if (user) redirect("/whats-new");

  // No AFTER_SIGN_UP env exists (only AFTER_SIGN_IN), so without this
  // Clerk sends a freshly-registered invitee to "/", the marketing landing
  // page, instead of into the app. Same destination as the sign-in path.
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <SignUp routing="hash" forceRedirectUrl="/whats-new" />
    </main>
  );
}
