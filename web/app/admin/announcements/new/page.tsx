import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { AnnouncementForm } from "@/components/admin/announcement-form";

export default async function NewAnnouncementPage() {
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

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 p-8">
      <div>
        <Link href="/admin/announcements" className="text-sm text-muted-foreground hover:underline">
          ← Back to Announcements
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Send Announcement</h1>
        <p className="text-muted-foreground">
          Broadcasts immediately to every member, in-app and by email, regardless of their
          notification preferences.
        </p>
      </div>
      <AnnouncementForm />
    </main>
  );
}
