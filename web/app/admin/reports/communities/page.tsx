import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Download } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { getCommunityMembershipReport } from "@/lib/community-report-server";
import type { CommunityMemberRow, ReportMember } from "@/lib/community-report";
import { StatCard } from "@/components/dashboard/stat-card";
import { Avatar } from "@/components/ui/avatar";

const GRID = "grid grid-cols-[1.5rem_minmax(9rem,1fr)_minmax(6rem,10rem)_4rem_4rem_4rem_4rem] items-center gap-3";

function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function csvHref(group: string): string {
  return `/api/admin/reports/communities?group=${encodeURIComponent(group)}`;
}

function MemberList({ members }: { members: Array<ReportMember | CommunityMemberRow> }) {
  if (members.length === 0) return <p className="text-sm text-muted-foreground">No members.</p>;
  return (
    <ul className="divide-y">
      {members.map((m) => (
        <li key={m.id} className="flex items-center gap-3 py-2 text-sm">
          <Avatar name={m.name} src={m.avatarUrl} size="sm" />
          <div className="min-w-0 flex-1">
            <Link href={`/members/${m.id}`} className="font-medium hover:underline">
              {m.name}
            </Link>
            <p className="truncate text-muted-foreground">
              {[m.title, m.country].filter(Boolean).join(" · ") || "No title or country"}
            </p>
          </div>
          {"joinedAt" in m && (
            <span className="shrink-0 text-xs text-muted-foreground">Joined {formatDate(m.joinedAt)}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function CsvLink({ group }: { group: string }) {
  return (
    <a
      href={csvHref(group)}
      className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
    >
      <Download className="h-4 w-4" aria-hidden />
      Export CSV
    </a>
  );
}

/**
 * Admin-only breakdown of explicit Community membership (ProfileCommunity),
 * ranked by direct joins. "Follow all communities" members are part of every
 * community's audience, so they're counted in a separate column and listed
 * once in their own section rather than repeated under each community.
 */
export default async function AdminCommunityReportPage() {
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

  const report = await getCommunityMembershipReport();
  const maxTotal = Math.max(1, ...report.communities.map((c) => c.totalCount));

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 p-4 sm:p-8">
      <div>
        <Link href="/admin/reports" className="text-sm text-muted-foreground hover:underline">
          ← Back to Reports
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Community Membership</h1>
        <p className="text-muted-foreground">
          Which communities members have joined, ranked by popularity. Active members only (excludes
          applicants, guests, and suspended accounts).
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Active members" value={report.activeMemberCount.toLocaleString()} />
        <StatCard
          label="Follow all communities"
          value={report.allFollowers.length.toLocaleString()}
          sublabel="Counted in every community's total"
        />
        <StatCard
          label="Not in any community"
          value={report.unaffiliated.length.toLocaleString()}
          sublabel="Candidates for a nudge"
        />
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold tracking-tight">Ranking</h2>
        <div className="overflow-x-auto rounded-lg border">
          <div className="min-w-[40rem]">
            <div className={`${GRID} border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground`}>
              <span>#</span>
              <span>Community</span>
              <span>Size</span>
              <span className="text-right">Direct</span>
              <span className="text-right" title="Members who follow all communities">
                Via All
              </span>
              <span className="text-right">Total</span>
              <span className="text-right" title="Direct joins in the last 30 days">
                New 30d
              </span>
            </div>
            {report.communities.map((c, i) => (
              <details key={c.id} id={`community-${c.slug}`} className="group border-b last:border-b-0">
                <summary
                  className={`${GRID} cursor-pointer list-none px-4 py-3 text-sm hover:bg-muted/40 [&::-webkit-details-marker]:hidden`}
                >
                  <span className="text-muted-foreground">{i + 1}</span>
                  <span className="flex items-center gap-1 font-medium">
                    <ChevronRight
                      className="h-4 w-4 shrink-0 transition-transform group-open:rotate-90"
                      aria-hidden
                    />
                    {c.name}
                  </span>
                  <span className="flex h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <span className="bg-primary" style={{ width: `${(c.directCount / maxTotal) * 100}%` }} />
                    <span className="bg-primary/35" style={{ width: `${(c.viaAllCount / maxTotal) * 100}%` }} />
                  </span>
                  <span className="text-right font-semibold tabular-nums">{c.directCount}</span>
                  <span className="text-right tabular-nums text-muted-foreground">{c.viaAllCount}</span>
                  <span className="text-right tabular-nums">{c.totalCount}</span>
                  <span className="text-right tabular-nums">{c.newCount > 0 ? `+${c.newCount}` : "0"}</span>
                </summary>
                <div className="flex flex-col gap-2 bg-muted/20 px-4 pb-4 pt-2 sm:pl-12">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-muted-foreground">
                      {c.directCount} joined directly
                      {report.allFollowers.length > 0 && (
                        <>
                          {" "}
                          · plus {c.viaAllCount} via{" "}
                          <a href="#all-communities" className="underline">
                            All communities
                          </a>
                        </>
                      )}
                    </p>
                    {c.directCount > 0 && <CsvLink group={c.id} />}
                  </div>
                  <MemberList members={c.members} />
                </div>
              </details>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Ranked by direct joins. Bar: solid = direct, light = via &ldquo;follow all communities&rdquo;. Click a
          community to see its members.
        </p>
      </section>

      <section id="all-communities" className="flex scroll-mt-20 flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">
              Follow all communities ({report.allFollowers.length})
            </h2>
            <p className="text-sm text-muted-foreground">
              These members see every community, including ones added later.
            </p>
          </div>
          {report.allFollowers.length > 0 && <CsvLink group="all" />}
        </div>
        <div className="rounded-lg border px-4">
          <MemberList members={report.allFollowers} />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">
              Not in any community ({report.unaffiliated.length})
            </h2>
            <p className="text-sm text-muted-foreground">
              Active members who haven&apos;t joined a community or chosen to follow all.
            </p>
          </div>
          {report.unaffiliated.length > 0 && <CsvLink group="none" />}
        </div>
        <div className="rounded-lg border px-4">
          <MemberList members={report.unaffiliated} />
        </div>
      </section>
    </main>
  );
}
