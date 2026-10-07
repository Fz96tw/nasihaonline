import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getAnnouncementDraft } from "@/lib/announcements-server";
import { AnnouncementDraftEditor } from "@/components/admin/announcement-draft-editor";

export default async function AnnouncementDraftPage({ params }: { params: { id: string } }) {
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

  const draft = await getAnnouncementDraft(params.id);
  if (!draft) notFound();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 p-8">
      <div>
        <Link href="/admin/announcements" className="text-sm text-muted-foreground hover:underline">
          ← Back to Announcements
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Review draft</h1>
        <p className="text-muted-foreground">
          Nothing has been sent. Edit it if needed, then approve to publish it to every member via the
          channels below.
        </p>
      </div>
      <AnnouncementDraftEditor draft={draft} />
    </main>
  );
}
