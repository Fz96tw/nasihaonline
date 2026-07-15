import { redirect } from "next/navigation";
import { SignIn } from "@clerk/nextjs";
import { getSessionUser } from "@/lib/auth";

/**
 * Clerk's hosted sign-in UI, rendered at our own /sign-in route so we
 * control the surrounding page chrome. There is no public self-registration
 * anywhere in this app — the only sign-up-shaped UI is /accept-invite,
 * which only completes for a valid invitation ticket (Clerk's Restricted
 * sign-up mode rejects everyone else there regardless of the UI existing).
 *
 * routing="hash": this route also has to handle Clerk's invitation ticket
 * flow (?__clerk_ticket=...), which signs the user in and immediately
 * client-redirects to NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL. Clerk's dev-only
 * catch-all-route check races that redirect — it re-reads
 * window.location.pathname *after* the redirect and probes the wrong path.
 * Hash routing skips that check entirely (it only runs for routing="path").
 */
export default async function SignInPage() {
  const user = await getSessionUser();
  if (user?.suspended) redirect("/account-suspended");
  if (user) redirect("/dashboard");

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <SignIn routing="hash" />
    </main>
  );
}
