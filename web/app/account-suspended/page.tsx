import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { AccountSuspendedActions } from "@/components/account-suspended-actions";

/**
 * Landing point for a suspended account (§4.15). Suspension doesn't revoke
 * the underlying Clerk session, so redirecting a suspended user straight
 * back to /sign-in would loop (Clerk's hosted SignIn detects the still-valid
 * session and bounces them to /dashboard, which redirects here again) —
 * this page breaks that loop by giving them somewhere to actually land.
 */
export default async function AccountSuspendedPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  if (!user.suspended) redirect("/dashboard");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-3xl font-bold tracking-tight">Account suspended</h1>
      <p className="max-w-md text-muted-foreground">
        Your NASIHA account has been suspended and no longer has access to member
        features. If you believe this is a mistake, please contact an administrator.
      </p>
      <AccountSuspendedActions />
    </main>
  );
}
