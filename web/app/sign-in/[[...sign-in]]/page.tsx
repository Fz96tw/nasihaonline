import { SignIn } from "@clerk/nextjs";

/**
 * Clerk's hosted sign-in UI, rendered at our own /sign-in route so we
 * control the surrounding page chrome. There is deliberately no /sign-up
 * route or <SignUp/> anywhere in this app — self-registration only ever
 * happens server-side via lib/clerk-admin.ts, triggered by admin approval.
 */
export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <SignIn />
    </main>
  );
}
