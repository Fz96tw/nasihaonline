import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getOpenConductReports } from "@/lib/conduct-server";
import type { OpenConductReportView } from "@/lib/conduct";
import { ConductReportQueue } from "@/components/admin/conduct-report-queue";

/**
 * Admin-only (not moderator-shared like /admin/content) — Code of Conduct
 * enforcement (§4.15) is a Board-discretion matter, same scoping as
 * /admin/users.
 */
export default async function AdminConductPage() {
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

  const reports = await getOpenConductReports();
  const reportViews: OpenConductReportView[] = reports.map((report) => ({
    id: report.id,
    description: report.description,
    createdAt: report.createdAt.toISOString(),
    reportedUser: report.reportedUser,
    reporter: report.reporter,
    priorViolations: report.priorViolations.map((violation) => ({
      id: violation.id,
      description: violation.description,
      actionTaken: violation.actionTaken!,
      actionTakenAt: violation.actionTakenAt!.toISOString(),
      acknowledgedAt: violation.acknowledgedAt ? violation.acknowledgedAt.toISOString() : null,
    })),
  }));

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 p-8">
      <div>
        <Link href="/admin" className="text-sm text-muted-foreground hover:underline">
          ← Back to Admin
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Conduct</h1>
        <p className="text-muted-foreground">
          Member-reported conduct concerns. Recording a warning, suspension, or removal is never
          publicly visible — only to the affected member and to admins.
        </p>
      </div>

      <ConductReportQueue initialReports={reportViews} />
    </main>
  );
}
