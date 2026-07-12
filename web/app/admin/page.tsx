import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getAdmissionPhase } from "@/lib/settings";
import { AdminPhaseForm } from "@/components/admin-phase-form";
import { Button } from "@/components/ui/button";

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

  const admissionPhase = await getAdmissionPhase();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin</h1>
          <p className="text-muted-foreground">Signed in as {user.email} (admin)</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/admin/applications">Review Applications</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/ledger">Knowledge Hours Ledger</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/team">Our Team</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/donations">Donations</Link>
          </Button>
        </div>
      </div>
      <AdminPhaseForm currentPhase={admissionPhase} />
    </main>
  );
}
