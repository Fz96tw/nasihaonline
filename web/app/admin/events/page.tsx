import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getPastEventsForAttendance } from "@/lib/attendance-server";
import { AdminEventAttendanceQueue } from "@/components/admin-event-attendance-queue";

/**
 * Role-gated the same way as /admin (see that page's comment): the Forbidden
 * UI here is a 200; the POST route underneath is the literal, directly-
 * testable 403/401 for a non-host, non-admin caller.
 */
export default async function AdminEventsPage() {
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

  const events = await getPastEventsForAttendance();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 p-8">
      <div>
        <Link href="/admin" className="text-sm text-muted-foreground hover:underline">
          ← Back to Admin
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Event Attendance</h1>
        <p className="text-muted-foreground">
          Record a host&apos;s attendance for a past event to auto-post their Knowledge Hours earn transaction.
        </p>
      </div>

      <AdminEventAttendanceQueue initialEvents={events} />
    </main>
  );
}
