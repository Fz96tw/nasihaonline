import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildApplicationFilterWhere, STATUS_LABELS, STATUS_BADGE_VARIANT } from "@/lib/applications";
import { ApplicationStatus } from "@/lib/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Role-gated the same way as /admin (see that page's comment): the Forbidden
 * UI here is a 200; GET /api/admin/applications is the literal,
 * directly-testable 403 for this same check.
 */
export default async function AdminApplicationsPage({
  searchParams,
}: {
  searchParams: { status?: string; referral?: string };
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

  const status = searchParams.status ?? "";
  const referral = searchParams.referral ?? "";
  const where = buildApplicationFilterWhere(status || null, referral || null);
  const applications = await db.membershipApplication.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Applications</h1>
        <p className="text-muted-foreground">Review, approve, or reject membership applications.</p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-[10px] border p-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="status" className="text-xs font-medium text-muted-foreground">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={status}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">All</option>
            {Object.values(ApplicationStatus).map((value) => (
              <option key={value} value={value}>
                {STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="referral" className="text-xs font-medium text-muted-foreground">
            Referral source
          </label>
          <Input id="referral" name="referral" defaultValue={referral} placeholder="Search referral name…" className="w-64" />
        </div>
        <Button type="submit">Filter</Button>
        {(status || referral) && (
          <Button asChild variant="ghost">
            <Link href="/admin/applications">Clear</Link>
          </Button>
        )}
      </form>

      <div className="rounded-[10px] border shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Applicant</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Referral</TableHead>
              <TableHead>Submitted</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {applications.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No applications match these filters.
                </TableCell>
              </TableRow>
            )}
            {applications.map((application) => (
              <TableRow key={application.id}>
                <TableCell>
                  <Link
                    href={`/admin/applications/${application.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {application.firstName} {application.lastName}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">{application.email}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_BADGE_VARIANT[application.status]}>
                    {STATUS_LABELS[application.status]}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{application.referral || "—"}</TableCell>
                <TableCell className="text-muted-foreground">
                  {application.createdAt.toLocaleDateString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </main>
  );
}
