import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getAdminUserDetail } from "@/lib/users-server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserDetailActions } from "@/components/admin/user-detail-actions";
import { ROLE_LABELS, ROLE_BADGE_VARIANT } from "@/lib/validation/user-admin";
import { TIER_LABELS } from "@/lib/validation/application-review";
import { TIER_BADGE_VARIANT } from "@/lib/members";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm">{value || "—"}</dd>
    </div>
  );
}

export default async function AdminUserDetailPage({ params }: { params: { id: string } }) {
  const admin = await getSessionUser();
  if (!admin) redirect("/sign-in");

  if (admin.role !== "admin") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-2 p-8">
        <h1 className="text-3xl font-bold tracking-tight">Forbidden</h1>
        <p className="text-muted-foreground">You don&apos;t have access to this page.</p>
      </main>
    );
  }

  const user = await getAdminUserDetail(params.id);
  if (!user) notFound();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 p-8">
      <div>
        <Link href="/admin/users" className="text-sm text-muted-foreground hover:underline">
          ← Back to users
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">{user.name ?? user.email}</h1>
          <Badge variant={ROLE_BADGE_VARIANT[user.role]}>{ROLE_LABELS[user.role]}</Badge>
          {user.tier && (
            <Badge variant={TIER_BADGE_VARIANT[user.tier]}>{TIER_LABELS[user.tier]}</Badge>
          )}
          <Badge variant={user.suspended ? "danger" : "success"}>
            {user.suspended ? "Suspended" : "Active"}
          </Badge>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Profile summary</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Field label="Email" value={user.email} />
            <Field label="Title / Specialty" value={user.profile?.titleSpecialty} />
            <Field label="Country / Region" value={user.profile?.countryRegion} />
            <Field label="Career stage" value={user.profile?.careerStage} />
            <Field label="Joined" value={user.createdAt.toLocaleString()} />
            {user.suspended && (
              <Field
                label="Suspended at"
                value={user.suspendedAt ? user.suspendedAt.toLocaleString() : null}
              />
            )}
          </dl>
        </CardContent>
      </Card>

      <UserDetailActions
        userId={user.id}
        role={user.role}
        tier={user.tier}
        suspended={user.suspended}
        isSelf={user.id === admin.id}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Tier history</CardTitle>
        </CardHeader>
        <CardContent>
          {user.tierHistoryEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tier changes recorded yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {user.tierHistoryEntries.map((entry) => (
                <li key={entry.id} className="flex flex-col gap-0.5 border-b pb-3 text-sm last:border-b-0 last:pb-0">
                  <span>
                    {entry.fromTier ? TIER_LABELS[entry.fromTier] : "No tier"}
                    {" → "}
                    {entry.toTier ? TIER_LABELS[entry.toTier] : "No tier"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {entry.createdAt.toLocaleString()} by{" "}
                    {entry.changedByUser.name ?? entry.changedByUser.email}
                    {entry.reason ? ` — ${entry.reason}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
