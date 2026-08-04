import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getAdminActionLog } from "@/lib/audit-server";
import { formatAdminAction, adminActionEntityHref } from "@/lib/audit";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Reverse-chronological feed of every AdminActionLog entry (§4.15's admin
 * audit trail work) — the one place another admin can see who resolved a
 * given alert-worthy item, across every domain that shares the /admin
 * panel, instead of just watching a badge disappear. Simple createdAt
 * cursor via ?before=, same query-string convention as
 * /admin/applications's status/referral filters — no pagination pattern
 * existed anywhere else in /admin to match instead.
 */
export default async function AdminActivityPage({
  searchParams,
}: {
  searchParams: { before?: string };
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
  const { items, hasMore } = await getAdminActionLog({ before });

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 p-8">
      <div>
        <Link href="/admin" className="text-sm text-muted-foreground hover:underline">
          ← Back to Admin
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Activity Log</h1>
        <p className="text-muted-foreground">
          Every resolved alert across Applications, Conduct, Privacy Requests, Content Moderation,
          and Contact Messages — who acted, when, and what they did.
        </p>
      </div>

      <div className="rounded-[10px] border shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Admin</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Item</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No activity yet.
                </TableCell>
              </TableRow>
            )}
            {items.map((entry) => {
              const href = adminActionEntityHref(entry.entityType, entry.entityId);
              return (
                <TableRow key={entry.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {entry.createdAt.toLocaleString()}
                  </TableCell>
                  <TableCell>{entry.actor.name ?? entry.actor.email}</TableCell>
                  <TableCell>{formatAdminAction(entry.action)}</TableCell>
                  <TableCell>
                    {href ? (
                      <Link href={href} className="underline underline-offset-2">
                        {entry.entityType}
                      </Link>
                    ) : (
                      entry.entityType
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {hasMore && items.length > 0 && (
        <Link
          href={`/admin/activity?before=${encodeURIComponent(items[items.length - 1].createdAt.toISOString())}`}
          className="self-center text-sm text-muted-foreground hover:underline"
        >
          Load older entries →
        </Link>
      )}
    </main>
  );
}
