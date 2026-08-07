import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getMySubmissions } from "@/lib/library-server";
import { Button } from "@/components/ui/button";
import { MySubmissionsTable } from "@/components/library/my-submissions-table";

export const metadata: Metadata = {
  title: "My Submissions — NASIHA",
};

/**
 * "The submitter can see their own pending_review items (with status)"
 * (§4.9's acceptance criterion) — every status a member's own submission can
 * be in, not just pending_review, so they can also see when something was
 * published or rejected. Other members never see this page's data: it's
 * scoped to `contributorId: user.id` in getMySubmissions, unlike the
 * Steward-facing /admin/library/review-queue.
 */
export default async function MyLibrarySubmissionsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const submissions = await getMySubmissions(user.id);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/library"
            className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Library
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">My Submissions</h1>
          <p className="text-muted-foreground">Resources you&apos;ve submitted to the Knowledge Library.</p>
        </div>
        <Button asChild>
          <Link href="/library/new">Submit a Resource</Link>
        </Button>
      </div>

      <MySubmissionsTable submissions={submissions} />
    </main>
  );
}
