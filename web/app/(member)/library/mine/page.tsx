import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getMySubmissions } from "@/lib/library-server";
import { CONTENT_TYPE_LABELS, STATUS_BADGE_VARIANT, STATUS_LABELS } from "@/lib/library";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = {
  title: "My Submissions — Nasiha",
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
          <h1 className="text-3xl font-bold tracking-tight">My Submissions</h1>
          <p className="text-muted-foreground">Resources you&apos;ve submitted to the Knowledge Library.</p>
        </div>
        <Button asChild>
          <Link href="/library/new">Submit a Resource</Link>
        </Button>
      </div>

      <div className="rounded-[10px] border shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Submitted</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {submissions.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  You haven&apos;t submitted any resources yet.
                </TableCell>
              </TableRow>
            )}
            {submissions.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.title}</TableCell>
                <TableCell className="text-muted-foreground">{CONTENT_TYPE_LABELS[item.contentType]}</TableCell>
                <TableCell className="text-muted-foreground">{item.category.name}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_BADGE_VARIANT[item.status]}>{STATUS_LABELS[item.status]}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(item.createdAt).toLocaleDateString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </main>
  );
}
