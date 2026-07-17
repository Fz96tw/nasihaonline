import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getEventEngagementForAdmin } from "@/lib/events-server";
import { EventEngagementTable } from "@/components/admin/event-engagement-table";
import { Button } from "@/components/ui/button";

/**
 * Gated to moderator OR admin, same as /admin/content and
 * /admin/library/review-queue — event engagement feeds membership-campaign
 * outreach, which isn't strictly an admin-only concern.
 */
export default async function AdminEventRegistrationsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  if (user.role !== "moderator" && user.role !== "admin") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-2 p-8">
        <h1 className="text-3xl font-bold tracking-tight">Forbidden</h1>
        <p className="text-muted-foreground">You don&apos;t have access to this page.</p>
      </main>
    );
  }

  const rows = await getEventEngagementForAdmin();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href={user.role === "admin" ? "/admin" : "/dashboard"}
            className="text-sm text-muted-foreground hover:underline"
          >
            ← Back to {user.role === "admin" ? "Admin" : "Dashboard"}
          </Link>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Event Registrations</h1>
          <p className="text-muted-foreground">
            {rows.length} {rows.length === 1 ? "person has" : "people have"} registered or RSVP&apos;d
            for an event — filter by member/non-member for membership-campaign outreach.
          </p>
        </div>
        <Button asChild variant="outline">
          <a href="/api/admin/event-registrations?export=csv">Export CSV</a>
        </Button>
      </div>

      <EventEngagementTable rows={rows} />
    </main>
  );
}
