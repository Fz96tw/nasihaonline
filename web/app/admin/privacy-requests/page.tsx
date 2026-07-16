import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getOpenPrivacyRequests } from "@/lib/privacy-server";
import type { OpenPrivacyRequestView } from "@/lib/privacy";
import { PrivacyRequestQueue } from "@/components/admin/privacy-request-queue";

/**
 * Admin-only (not moderator-shared like /admin/content) — data-rights
 * fulfillment (§4.15) maps to the Charter's Board-appointed Privacy Lead,
 * same admin-only scoping as /admin/conduct.
 */
export default async function AdminPrivacyRequestsPage() {
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

  const requests = await getOpenPrivacyRequests();
  const requestViews: OpenPrivacyRequestView[] = requests.map((request) => ({
    id: request.id,
    type: request.type,
    status: request.status,
    requestedAt: request.requestedAt.toISOString(),
    fulfilledAt: request.fulfilledAt ? request.fulfilledAt.toISOString() : null,
    user: request.user,
    hasRetainedHistory: request.hasRetainedHistory,
  }));

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 p-8">
      <div>
        <Link href="/admin" className="text-sm text-muted-foreground hover:underline">
          ← Back to Admin
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Privacy Requests</h1>
        <p className="text-muted-foreground">
          Member data export and deletion requests (§4.15). Export-file generation and
          deletion/anonymization are manual, offline steps — mark a request fulfilled only once that
          work is actually done.
        </p>
      </div>

      <PrivacyRequestQueue initialRequests={requestViews} />
    </main>
  );
}
