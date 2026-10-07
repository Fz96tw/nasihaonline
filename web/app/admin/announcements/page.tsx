import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { listAnnouncementDrafts, listAnnouncementHistory } from "@/lib/announcements-server";
import { Button } from "@/components/ui/button";
import { AnnouncementHistoryTable } from "@/components/admin/announcement-history-table";
import { AnnouncementDraftsTable } from "@/components/admin/announcement-drafts-table";

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

  const [announcements, drafts] = await Promise.all([listAnnouncementHistory(), listAnnouncementDrafts()]);

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

      {drafts.length > 0 && (
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="text-xl font-semibold">Drafts awaiting review</h2>
            <p className="text-sm text-muted-foreground">
              Not sent yet — members see nothing until a draft is approved and published.
            </p>
          </div>
          <AnnouncementDraftsTable drafts={drafts} />
        </section>
      )}

      <AnnouncementHistoryTable announcements={announcements} />
    </main>
  );
}
