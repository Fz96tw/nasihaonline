import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import {
  getCommunityHealthReport,
  getKnowledgeExchangeReport,
  getOrganizationalHealthReport,
} from "@/lib/reports-server";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function pct(value: number | null, digits = 0): string {
  return value === null ? "—" : `${value.toFixed(digits)}%`;
}

function num(value: number, digits = 0): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

/**
 * §4.11 KPI dashboard, fleshed out from docs/Nasiha_KPIs.md's four metric
 * groups. Community Health, Knowledge Exchange Activity, and Organizational
 * Health are computed live from existing entities (see reports-server.ts
 * for the exact definitions/proxies used, since the KPI doc names the
 * metrics but not the SQL). Impact metrics depend on self-reported survey
 * data nothing in this system generates yet, so that section is a clearly
 * marked placeholder rather than fabricated numbers.
 */
export default async function AdminReportsPage() {
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

  const [community, exchange, org] = await Promise.all([
    getCommunityHealthReport(),
    getKnowledgeExchangeReport(),
    getOrganizationalHealthReport(),
  ]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 p-8">
      <div>
        <Link href="/admin" className="text-sm text-muted-foreground hover:underline">
          ← Back to Admin
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Reports</h1>
        <p className="text-muted-foreground">
          Community, engagement, and organizational KPIs computed from live platform data.
        </p>
      </div>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Community Health</h2>
          <p className="text-sm text-muted-foreground">
            Growth, retention, and diversity of the membership.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            label="Recently active members"
            value={num(community.recentlyActiveMemberCount)}
            sublabel="Any tier, activity in the past quarter"
          />
          <StatCard
            label="Retention rate (YoY)"
            value={pct(community.retentionRateYoY)}
            sublabel={
              community.retentionRateYoY === null
                ? "Not enough historical data yet"
                : "Of members active this quarter last year"
            }
          />
          <StatCard label="Countries represented" value={num(community.countriesRepresented)} />
          <StatCard
            label="New members this quarter"
            value={num(community.newMembersThisQuarter)}
            sublabel="Applications approved this calendar quarter"
          />
          <StatCard
            label="Student & trainee representation"
            value={pct(community.studentTraineeRepresentationPct)}
            sublabel="Share of tiered members on the Student tier"
          />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Knowledge Exchange Activity</h2>
          <p className="text-sm text-muted-foreground">Whether learning and teaching is actually happening.</p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard label="Lectures & webinars this month" value={num(exchange.lecturesWebinarsThisMonth)} />
          <StatCard label="Case discussions this month" value={num(exchange.caseDiscussionsThisMonth)} />
          <StatCard label="Total Hours earned" value={num(exchange.totalHoursEarned, 1)} sublabel="All-time, confirmed" />
          <StatCard label="Total Hours spent" value={num(exchange.totalHoursSpent, 1)} sublabel="All-time, confirmed" />
          <StatCard
            label="Earn:spend ratio"
            value={exchange.earnSpendRatio === null ? "—" : exchange.earnSpendRatio.toFixed(2)}
            sublabel={exchange.earnSpendRatio === null ? "No Hours spent yet" : undefined}
          />
          <StatCard
            label="Unique contributor–recipient pairings"
            value={num(exchange.uniqueContributorRecipientPairings)}
          />
          <StatCard label="Resources shared" value={num(exchange.resourcesShared)} sublabel="Library submissions, all statuses except rejected" />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Organizational Health</h2>
          <p className="text-sm text-muted-foreground">Whether Nasiha is being run well as an organization.</p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            label="Application turnaround time"
            value={org.avgApplicationTurnaroundDays === null ? "—" : `${org.avgApplicationTurnaroundDays.toFixed(1)}d`}
            sublabel="Average, submission to decision"
          />
          <StatCard
            label="Code of Conduct incidents"
            value={num(org.conductIncidentCount)}
            sublabel={`${num(org.conductIncidentsResolved)} resolved`}
          />
          <StatCard
            label="Ledger reconciliation"
            value={
              org.ledgerReconciliation.integrityIssueCount === 0
                ? "Reconciled"
                : `${num(org.ledgerReconciliation.integrityIssueCount)} issue(s)`
            }
            sublabel={`${num(org.ledgerReconciliation.totalConfirmedTransactions)} confirmed transactions checked`}
          />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Impact</h2>
          <p className="text-sm text-muted-foreground">
            Whether Nasiha is making a real difference — harder to measure, but the most important.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Requires a future survey mechanism</CardTitle>
            <CardDescription>
              Member satisfaction, self-reported outcomes, trainee→Active progression, and repeat engagement
              all depend on periodic survey data that isn&apos;t generated anywhere else in the system yet.
              This section will populate once a lightweight in-app feedback mechanism exists — these numbers
              are intentionally not fabricated from proxy data.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Pending: Member satisfaction score · Self-reported outcomes · Trainee progression rate · Repeat
            engagement rate
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
