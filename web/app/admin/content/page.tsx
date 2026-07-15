import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getFlaggedContent } from "@/lib/moderation-server";
import { ContentModerationQueue } from "@/components/admin/content-moderation-queue";

/**
 * Gated to moderator OR admin, unlike most of /admin (admin-only) — same
 * scoping as /admin/library/review-queue, since Library Stewards/forum
 * moderators are moderators, not necessarily full admins (§11).
 */
export default async function AdminContentPage() {
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

  const items = await getFlaggedContent();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 p-8">
      <div>
        <Link href="/admin" className="text-sm text-muted-foreground hover:underline">
          ← Back to Admin
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Content Moderation</h1>
        <p className="text-muted-foreground">
          Flagged Blog posts, Library items, and Forum posts — one shared queue.
        </p>
      </div>

      <ContentModerationQueue initialItems={items} />
    </main>
  );
}
