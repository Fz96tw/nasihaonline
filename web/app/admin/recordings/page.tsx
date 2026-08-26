import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getAllRecordingsForAdmin } from "@/lib/admin-recordings-server";
import { AdminRecordingsList } from "@/components/admin/admin-recordings-list";

export default async function AdminRecordingsPage() {
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

  const groups = await getAllRecordingsForAdmin();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 p-8">
      <div>
        <Link href="/admin" className="text-sm text-muted-foreground hover:underline">
          ← Back to Admin
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Recordings</h1>
        <p className="text-muted-foreground">
          Every LiveKit recording across all Events and 1:1 Meetings, regardless of your own attendance.
        </p>
      </div>

      <AdminRecordingsList groups={groups} />
    </main>
  );
}
