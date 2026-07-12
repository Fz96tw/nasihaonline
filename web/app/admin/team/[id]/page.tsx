import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { withSignedPhotoUrl } from "@/lib/team-server";
import { TeamMemberForm } from "@/components/admin/team-member-form";

export default async function EditTeamMemberPage({ params }: { params: { id: string } }) {
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

  const member = await db.teamMember.findUnique({ where: { id: params.id } });
  if (!member) notFound();

  const withPhoto = await withSignedPhotoUrl(member);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Edit Team Member</h1>
      </div>
      <TeamMemberForm member={withPhoto} />
    </main>
  );
}
