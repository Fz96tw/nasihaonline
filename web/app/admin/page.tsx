import Link from "next/link";
import { redirect } from "next/navigation";
import { BackLink } from "@/components/back-link";
import { getSessionUser } from "@/lib/auth";
import { getAdmissionPhase, getWelcomeAnnouncementSettings } from "@/lib/settings";
import { getFlaggedContentCount } from "@/lib/moderation-server";
import { getPendingLedgerCountForAdmin } from "@/lib/contributions-server";
import { getReviewQueueCount } from "@/lib/library-server";
import { getOpenConductReportCount } from "@/lib/conduct-server";
import { getOpenPrivacyRequestCount } from "@/lib/privacy-server";
import { getPendingApplicationsCount } from "@/lib/admin-review-server";
import { AdminPhaseForm } from "@/components/admin-phase-form";
import { WelcomeAnnouncementSettingsForm } from "@/components/admin/welcome-announcement-settings-form";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const ADMIN_GROUPS = [
  "Membership & People",
  "Content & Trust",
  "Money",
  "Communications",
  "Programs & Reports",
] as const;

const ADMIN_SECTIONS = [
  {
    href: "/admin/users",
    title: "Users",
    description: "Manage roles, tiers, and account suspensions.",
    group: "Membership & People",
  },
  {
    href: "/admin/applications",
    title: "Review Applications",
    description: "Approve or reject pending membership applications.",
    countKey: "applications",
    group: "Membership & People",
  },
  {
    href: "/admin/event-registrations",
    title: "Event Registrations",
    description: "Non-members who registered for an open event, for membership campaigns.",
    group: "Membership & People",
  },
  {
    href: "/admin/team",
    title: "Our Team",
    description: "Manage team member profiles shown on the site.",
    group: "Membership & People",
  },
  {
    href: "/admin/content",
    title: "Content Moderation",
    description: "Review flagged Blog posts, Library items, and Forum posts.",
    countKey: "content",
    group: "Content & Trust",
  },
  {
    href: "/admin/library/review-queue",
    title: "Library Review Queue",
    description: "Approve or reject submitted library content.",
    countKey: "libraryReview",
    group: "Content & Trust",
  },
  {
    href: "/admin/conduct",
    title: "Conduct",
    description: "Review member-reported conduct concerns and record enforcement actions.",
    countKey: "conduct",
    group: "Content & Trust",
  },
  {
    href: "/admin/privacy-requests",
    title: "Privacy Requests",
    description: "Fulfill member data export and deletion requests.",
    countKey: "privacy",
    group: "Content & Trust",
  },
  {
    href: "/admin/ledger",
    title: "Knowledge Hours Ledger",
    description: "View and adjust member Knowledge Hours credits.",
    countKey: "ledger",
    group: "Money",
  },
  {
    href: "/admin/donations",
    title: "Donations",
    description: "Review donation records.",
    group: "Money",
  },
  {
    href: "/admin/announcements",
    title: "Announcements",
    description: "Compose and send Board Announcements to every member.",
    group: "Communications",
  },
  {
    href: "/admin/surveys",
    title: "Surveys",
    description: "Build and send surveys to members, donors, and event registrants.",
    group: "Communications",
  },
  {
    href: "/admin/contact-messages",
    title: "Contact Messages",
    description: "Review messages submitted via the public contact form.",
    group: "Communications",
  },
  {
    href: "/admin/events",
    title: "Event Attendance",
    description: "Track and record attendance for events.",
    group: "Programs & Reports",
  },
  {
    href: "/admin/reports",
    title: "Reports",
    description: "Community, engagement, and organizational KPIs.",
    group: "Programs & Reports",
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
    welcomeAnnouncementSettings,
    applicationsCount,
    contentCount,
    ledgerCount,
    libraryReviewCount,
    conductCount,
    privacyCount,
  ] = await Promise.all([
    getAdmissionPhase(),
    getWelcomeAnnouncementSettings(),
    getPendingApplicationsCount(),
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

  const needsAttention = ADMIN_SECTIONS.filter(
    (section) => "countKey" in section && counts[section.countKey] > 0,
  ).sort((a, b) => {
    const countA = "countKey" in a ? counts[a.countKey] : 0;
    const countB = "countKey" in b ? counts[b.countKey] : 0;
    return countB - countA;
  });

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 p-8">
      <div>
        <BackLink fallbackHref="/dashboard" />
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Admin</h1>
        <p className="text-muted-foreground">Signed in as {user.email} (admin)</p>
      </div>

      {needsAttention.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Needs attention
          </h2>
          <div className="flex flex-wrap gap-2">
            {needsAttention.map((section) => {
              const count = "countKey" in section ? counts[section.countKey] : 0;
              return (
                <Link
                  key={section.href}
                  href={section.href}
                  className="flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent"
                >
                  {section.title}
                  <Badge variant="warning" className="shrink-0 whitespace-nowrap">
                    {count}
                  </Badge>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-8">
        {ADMIN_GROUPS.map((group) => {
          const sections = ADMIN_SECTIONS.filter((section) => section.group === group);
          if (sections.length === 0) return null;
          return (
            <div key={group} className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {group}
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {sections.map((section) => {
                  const count = "countKey" in section ? counts[section.countKey] : undefined;
                  return (
                    <Link key={section.href} href={section.href}>
                      <Card className="h-full">
                        <CardHeader>
                          <div className="flex items-center justify-between gap-2">
                            <CardTitle className="min-w-0 truncate text-lg">
                              {section.title}
                            </CardTitle>
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
                {group === "Communications" && (
                  <WelcomeAnnouncementSettingsForm
                    initialInFeed={welcomeAnnouncementSettings.welcomeAnnouncementInFeed}
                    initialNotify={welcomeAnnouncementSettings.welcomeAnnouncementNotify}
                    initialEmail={welcomeAnnouncementSettings.welcomeAnnouncementEmail}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Settings
        </h2>
        <AdminPhaseForm currentPhase={admissionPhase} />
      </div>
    </main>
  );
}
