import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getAdmissionPhase } from "@/lib/settings";
import { getFlaggedContentCount } from "@/lib/moderation-server";
import { getPendingLedgerCountForAdmin } from "@/lib/contributions-server";
import { getReviewQueueCount } from "@/lib/library-server";
import { getOpenConductReportCount } from "@/lib/conduct-server";
import { getOpenPrivacyRequestCount } from "@/lib/privacy-server";
import { db } from "@/lib/db";
import { ApplicationStatus } from "@/lib/generated/prisma/enums";
import { AdminPhaseForm } from "@/components/admin-phase-form";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const ADMIN_SECTIONS = [
  {
    href: "/admin/users",
    title: "Users",
    description: "Manage roles, tiers, and account suspensions.",
  },
  {
    href: "/admin/applications",
    title: "Review Applications",
    description: "Approve or reject pending membership applications.",
    countKey: "applications",
  },
  {
    href: "/admin/content",
    title: "Content Moderation",
    description: "Review flagged Blog posts, Library items, and Forum posts.",
    countKey: "content",
  },
  {
    href: "/admin/ledger",
    title: "Knowledge Hours Ledger",
    description: "View and adjust member Knowledge Hours credits.",
    countKey: "ledger",
  },
  {
    href: "/admin/events",
    title: "Event Attendance",
    description: "Track and record attendance for events.",
  },
  {
    href: "/admin/team",
    title: "Our Team",
    description: "Manage team member profiles shown on the site.",
  },
  {
    href: "/admin/donations",
    title: "Donations",
    description: "Review donation records.",
  },
  {
    href: "/admin/library/review-queue",
    title: "Library Review Queue",
    description: "Approve or reject submitted library content.",
    countKey: "libraryReview",
  },
  {
    href: "/admin/conduct",
    title: "Conduct",
    description: "Review member-reported conduct concerns and record enforcement actions.",
    countKey: "conduct",
  },
  {
    href: "/admin/privacy-requests",
    title: "Privacy Requests",
    description: "Fulfill member data export and deletion requests.",
    countKey: "privacy",
  },
] as const;

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

  const [
    admissionPhase,
    applicationsCount,
    contentCount,
    ledgerCount,
    libraryReviewCount,
    conductCount,
    privacyCount,
  ] = await Promise.all([
    getAdmissionPhase(),
    db.membershipApplication.count({
      where: { status: { in: [ApplicationStatus.submitted, ApplicationStatus.under_review] } },
    }),
    getFlaggedContentCount(),
    getPendingLedgerCountForAdmin(),
    getReviewQueueCount(),
    getOpenConductReportCount(),
    getOpenPrivacyRequestCount(),
  ]);

  const counts: Record<string, number> = {
    applications: applicationsCount,
    content: contentCount,
    ledger: ledgerCount,
    libraryReview: libraryReviewCount,
    conduct: conductCount,
    privacy: privacyCount,
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 p-8">
      <div>
        <Link href="/dashboard" className="text-sm text-muted-foreground hover:underline">
          ← Back to Dashboard
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Admin</h1>
        <p className="text-muted-foreground">Signed in as {user.email} (admin)</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {ADMIN_SECTIONS.map((section) => {
          const count = "countKey" in section ? counts[section.countKey] : undefined;
          return (
            <Link key={section.href} href={section.href}>
              <Card className="h-full transition-colors hover:bg-accent">
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="min-w-0 truncate text-lg">{section.title}</CardTitle>
                    {!!count && (
                      <Badge variant="warning" className="shrink-0 whitespace-nowrap">
                        {count} pending
                      </Badge>
                    )}
                  </div>
                  <CardDescription>{section.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          );
        })}
      </div>
      <AdminPhaseForm currentPhase={admissionPhase} />
    </main>
  );
}
