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
 * Domain filters for the page's pill row — keyed by a short `?domain=` slug
 * rather than the raw entityType(s) directly, since "Content Moderation"
 * spans four Prisma models (Post, PostComment, KnowledgeItem, ForumPost)
 * that share one admin queue (/admin/content) and one badge count.
 */
const ACTIVITY_DOMAIN_FILTERS: Record<string, { label: string; entityType: string | string[] }> = {
  applications: { label: "Applications", entityType: "MembershipApplication" },
  conduct: { label: "Conduct", entityType: "CodeOfConductViolation" },
  privacy: { label: "Privacy Requests", entityType: "PrivacyDataRequest" },
  content: { label: "Content Moderation", entityType: ["Post", "PostComment", "KnowledgeItem", "ForumPost"] },
  contact: { label: "Contact Messages", entityType: "ContactMessage" },
  ledger: { label: "Knowledge Hours Ledger", entityType: "ContributionLedger" },
};

function filterPillClass(active: boolean): string {
  return `rounded-full px-3 py-1 ${
    active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
  }`;
}

/**
 * Reverse-chronological feed of every AdminActionLog entry (§4.15's admin
 * audit trail work) — the one place another admin can see who resolved a
 * given alert-worthy item, across every domain that shares the /admin
 * panel, instead of just watching a badge disappear. Simple createdAt
 * cursor via ?before=, same query-string convention as
 * /admin/applications's status/referral filters — no pagination pattern
 * existed anywhere else in /admin to match instead. `?domain=` narrows to
 * one domain's entityType(s) via ACTIVITY_DOMAIN_FILTERS above.
 */
export default async function AdminActivityPage({
  searchParams,
}: {
  searchParams: { before?: string; domain?: string };
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

  const domainFilter = searchParams.domain ? ACTIVITY_DOMAIN_FILTERS[searchParams.domain] : undefined;
  const before = searchParams.before ? new Date(searchParams.before) : undefined;
  const { items, hasMore } = await getAdminActionLog({ before, entityType: domainFilter?.entityType });

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 p-8">
      <div>
        <Link href="/admin" className="text-sm text-muted-foreground hover:underline">
          ← Back to Admin
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Activity Log</h1>
        <p className="text-muted-foreground">
          Every resolved alert across Applications, Conduct, Privacy Requests, Content Moderation,
          Contact Messages, and the Knowledge Hours Ledger — who acted, when, and what they did.
        </p>
      </div>

      <div className="flex flex-wrap gap-1 text-sm">
        <Link href="/admin/activity" className={filterPillClass(!searchParams.domain)}>
          All
        </Link>
        {Object.entries(ACTIVITY_DOMAIN_FILTERS).map(([slug, filter]) => (
          <Link
            key={slug}
            href={`/admin/activity?domain=${slug}`}
            className={filterPillClass(searchParams.domain === slug)}
          >
            {filter.label}
          </Link>
        ))}
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
          href={`/admin/activity?${new URLSearchParams({
            ...(searchParams.domain ? { domain: searchParams.domain } : {}),
            before: items[items.length - 1].createdAt.toISOString(),
          }).toString()}`}
          className="self-center text-sm text-muted-foreground hover:underline"
        >
          Load older entries →
        </Link>
      )}
    </main>
  );
}
