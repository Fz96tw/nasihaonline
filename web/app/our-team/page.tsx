import type { Metadata } from "next";
import { db } from "@/lib/db";
import { withSignedPhotoUrls } from "@/lib/team-server";
import { TeamMemberCard } from "@/components/team/team-member-card";
import { ParallaxHeroImage } from "@/components/home/parallax-hero-image";
import { Reveal } from "@/components/home/reveal";

export const metadata: Metadata = {
  title: "Our Team — NASIHA",
};

export default async function OurTeamPage() {
  const members = await db.teamMember.findMany({
    where: { active: true },
    orderBy: { displayOrder: "asc" },
  });
  const withPhotos = await withSignedPhotoUrls(members);

  return (
    <main className="min-h-screen">
      <section className="relative overflow-hidden px-8 py-16 text-center text-primary-foreground">
        <ParallaxHeroImage src="/images/ourteam2.jpg" priority />
        <div className="absolute inset-0 -z-10 bg-[rgba(10,20,70,.65)]" />
        <div className="relative mx-auto max-w-[580px]">
          <h1 className="mb-3 text-[2.5rem] font-extrabold leading-[1.1] tracking-[-.02em] [text-shadow:0_2px_16px_rgba(0,10,40,.55)] md:text-[3.5rem]">Our Team</h1>
          <p className="text-lg leading-[1.7] opacity-[.88] [text-shadow:0_1px_10px_rgba(0,10,40,.6)]">
            Meet the founders, board members, and partners behind NASIHA.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-[1120px] px-8 py-16">
        {withPhotos.length === 0 ? (
          <p className="text-center text-muted-foreground">Team information coming soon.</p>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {withPhotos.map((member, index) => (
              <Reveal key={member.id} index={index} hover className="h-full">
                <TeamMemberCard member={member} />
              </Reveal>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
