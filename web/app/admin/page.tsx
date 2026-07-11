import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";

/**
 * Role-gated at the Node.js runtime (not middleware — see middleware.ts):
 * unauthenticated visitors are redirected to sign-in; authenticated
 * non-admins see a Forbidden message without ever rendering admin content.
 * The equivalent API check (app/api/admin/ping/route.ts) returns a real
 * HTTP 403, which is the literal, directly-testable form of this check.
 */
export default async function AdminPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  if (user.role !== "admin") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-2 p-8">
        <h1 className="text-3xl font-bold tracking-tight">Forbidden</h1>
        <p className="text-muted-foreground">
          You don&apos;t have access to this page.
        </p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-bold tracking-tight">Admin</h1>
      <p className="text-muted-foreground">Signed in as {user.email} (admin)</p>
    </main>
  );
}
