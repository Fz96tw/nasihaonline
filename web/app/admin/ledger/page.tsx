import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getPendingLedgerEntriesForAdmin } from "@/lib/contributions-server";
import { getAdminUsers } from "@/lib/users-server";
import { getAdminActionLog } from "@/lib/audit-server";
import { formatAdminAction } from "@/lib/audit";
import { formatHours } from "@/lib/contributions";
import { AdminLedgerQueue } from "@/components/admin-ledger-queue";
import { AdminLedgerAdjustmentDialog } from "@/components/admin-ledger-adjustment-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/** entityType tag ledger AdminActionLog rows are written under (lib/contributions-server.ts's resolveContribution/createLedgerAdjustment). */
const LEDGER_ENTITY_TYPE = "ContributionLedger";

const LEDGER_HISTORY_FILTERS: { label: string; action?: string }[] = [
  { label: "All" },
  { label: "Confirmed", action: "ledger.confirmed" },
  { label: "Rejected", action: "ledger.rejected" },
  { label: "Adjusted", action: "ledger.adjusted" },
];

/**
 * Role-gated the same way as /admin (see that page's comment): the Forbidden
 * UI here is a 200; the confirm/reject routes underneath are the literal,
 * directly-testable 403 for a non-admin acting on a no-counterpart entry.
 */
export default async function AdminLedgerPage({
  searchParams,
}: {
  searchParams: { action?: string; before?: string };
}) {
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

  const before = searchParams.before ? new Date(searchParams.before) : undefined;
  const [entries, users, history] = await Promise.all([
    getPendingLedgerEntriesForAdmin(),
    getAdminUsers(),
    getAdminActionLog({ entityType: LEDGER_ENTITY_TYPE, action: searchParams.action, before }),
  ]);

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

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold tracking-tight">Resolution History</h2>
          <div className="flex gap-1 text-sm">
            {LEDGER_HISTORY_FILTERS.map((filter) => (
              <Link
                key={filter.label}
                href={filter.action ? `/admin/ledger?action=${filter.action}` : "/admin/ledger"}
                className={`rounded-full px-3 py-1 ${
                  searchParams.action === filter.action
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {filter.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-[10px] border shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Admin</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Member</TableHead>
                <TableHead className="text-right">Hours</TableHead>
                <TableHead>Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No resolutions yet.
                  </TableCell>
                </TableRow>
              )}
              {history.items.map((entry) => {
                const metadata = (entry.metadata as Record<string, unknown> | null) ?? null;
                const targetUserName = typeof metadata?.targetUserName === "string" ? metadata.targetUserName : "—";
                const hours = typeof metadata?.hours === "number" ? formatHours(metadata.hours) : "—";
                const activity = typeof metadata?.activity === "string" ? metadata.activity : null;
                const reason = typeof metadata?.reason === "string" ? metadata.reason : null;
                return (
                  <TableRow key={entry.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {entry.createdAt.toLocaleString()}
                    </TableCell>
                    <TableCell>{entry.actor.name ?? entry.actor.email}</TableCell>
                    <TableCell>{formatAdminAction(entry.action)}</TableCell>
                    <TableCell>{targetUserName}</TableCell>
                    <TableCell className="text-right tabular-nums">{hours}</TableCell>
                    <TableCell className="text-muted-foreground">{activity ?? reason ?? "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {history.hasMore && history.items.length > 0 && (
          <Link
            href={`/admin/ledger?${new URLSearchParams({
              ...(searchParams.action ? { action: searchParams.action } : {}),
              before: history.items[history.items.length - 1].createdAt.toISOString(),
            }).toString()}`}
            className="self-center text-sm text-muted-foreground hover:underline"
          >
            Load older entries →
          </Link>
        )}
      </div>
    </main>
  );
}
