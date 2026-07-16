import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getDirectoryMembers } from "@/lib/members-server";
import { getAllSkills } from "@/lib/skills-server";
import { DirectoryFiltersBar } from "@/components/members/directory-filters-bar";
import { DirectoryGrid } from "@/components/members/directory-grid";

export const metadata: Metadata = {
  title: "Member Directory — NASIHA",
};

export default async function MembersPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const [members, skills] = await Promise.all([getDirectoryMembers(), getAllSkills()]);

  return (
    <main className="mx-auto flex max-w-[1120px] flex-col gap-8 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Member Directory</h1>
        <p className="text-muted-foreground">
          Find and connect with fellow NASIHA members by expertise, title, or country.
        </p>
      </div>

      <DirectoryFiltersBar availableSkills={skills} />
      <DirectoryGrid initialMembers={members} currentUserId={user.id} />
    </main>
  );
}
