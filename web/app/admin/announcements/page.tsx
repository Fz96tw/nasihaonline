import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { listAnnouncementHistory } from "@/lib/announcements-server";
import { Button } from "@/components/ui/button";
import { AnnouncementHistoryTable } from "@/components/admin/announcement-history-table";

export default async function AdminAnnouncementsPage() {
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

  const announcements = await listAnnouncementHistory();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/admin" className="text-sm text-muted-foreground hover:underline">
            ← Back to Admin
          </Link>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Announcements</h1>
          <p className="text-muted-foreground">
            Send Board Announcements to every member — infrequent, high-signal, org-wide updates.
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/announcements/new">Send Announcement</Link>
        </Button>
      </div>

      <AnnouncementHistoryTable announcements={announcements} />
    </main>
  );
}
