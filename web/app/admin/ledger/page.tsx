import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getPendingLedgerEntriesForAdmin } from "@/lib/contributions-server";
import { getAdminUsers } from "@/lib/users-server";
import { AdminLedgerQueue } from "@/components/admin-ledger-queue";
import { AdminLedgerAdjustmentDialog } from "@/components/admin-ledger-adjustment-dialog";

/**
 * Role-gated the same way as /admin (see that page's comment): the Forbidden
 * UI here is a 200; the confirm/reject routes underneath are the literal,
 * directly-testable 403 for a non-admin acting on a no-counterpart entry.
 */
export default async function AdminLedgerPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  if (user.role !== "admin") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-2 p-8">
        <h1 className="text-3xl font-bold tracking-tight">Forbidden</h1>
        <p className="text-muted-foreground">You don&apos;t have access to this page.</p>
      </main>
    );
  }

  const [entries, users] = await Promise.all([getPendingLedgerEntriesForAdmin(), getAdminUsers()]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/admin" className="text-sm text-muted-foreground hover:underline">
            ← Back to Admin
          </Link>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Knowledge Hours Ledger</h1>
          <p className="text-muted-foreground">
            Review and resolve pending contributions, including those with no named counterpart.
          </p>
        </div>
        <AdminLedgerAdjustmentDialog users={users} />
      </div>

      <AdminLedgerQueue initialEntries={entries} />
    </main>
  );
}
