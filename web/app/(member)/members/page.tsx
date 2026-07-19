import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getDirectoryMembers } from "@/lib/members-server";
import { getAllSkills } from "@/lib/skills-server";
import { DirectoryFiltersBar } from "@/components/members/directory-filters-bar";
import { DirectoryGrid } from "@/components/members/directory-grid";
import { ParallaxHeroImage } from "@/components/home/parallax-hero-image";

export const metadata: Metadata = {
  title: "Member Directory — NASIHA",
};

export default async function MembersPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const [members, skills] = await Promise.all([getDirectoryMembers(), getAllSkills()]);

  return (
    <main className="min-h-screen">
      <section className="relative overflow-hidden px-8 py-16 text-center text-primary-foreground">
        <ParallaxHeroImage src="/images/members3.jpg" priority />
        <div className="absolute inset-0 -z-10 bg-[rgba(10,20,70,.4)]" />
        <div className="relative mx-auto max-w-[580px]">
          <h1 className="mb-3 text-[2.5rem] font-extrabold leading-[1.1] tracking-[-.02em] [text-shadow:0_2px_16px_rgba(0,10,40,.55)] md:text-[3.5rem]">Member Directory</h1>
          <p className="text-xl leading-[1.6] opacity-[.88] [text-shadow:0_1px_10px_rgba(0,10,40,.6)] md:text-2xl">
            Find and connect with fellow NASIHA members by expertise, title, or country.
          </p>
        </div>
      </section>

      <section className="mx-auto flex max-w-[1120px] flex-col gap-8 px-8 py-16">
        <DirectoryFiltersBar availableSkills={skills} />
        <DirectoryGrid initialMembers={members} currentUserId={user.id} />
      </section>
    </main>
  );
}
