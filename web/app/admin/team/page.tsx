import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { withSignedPhotoUrls } from "@/lib/team-server";
import { Button } from "@/components/ui/button";
import { TeamMemberTable } from "@/components/admin/team-member-table";

export default async function AdminTeamPage() {
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

  const members = await db.teamMember.findMany({ orderBy: { displayOrder: "asc" } });

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Our Team</h1>
          <p className="text-muted-foreground">
            Manage the public Our Team page — add, edit, reorder, or remove members.
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/team/new">Add Team Member</Link>
        </Button>
      </div>

      <TeamMemberTable members={await withSignedPhotoUrls(members)} />
    </main>
  );
}
